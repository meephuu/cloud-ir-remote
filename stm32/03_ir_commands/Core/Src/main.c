/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2026 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */
#define IR_MAX_EDGES      600       // max durations per code (see docs/uart-protocol.md)
#define IR_END_GAP_US     80000u    // 80 ms silence = end of signal
#define CARRIER_ON        877       // 33% of 2631 -> 38 kHz pulses
#define LINE_MAX          5000      // longest command: "SEND,600," + 600 numbers
#define LEARN_TIMEOUT_MS  10000u
/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
TIM_HandleTypeDef htim2;
TIM_HandleTypeDef htim3;
TIM_HandleTypeDef htim5;

UART_HandleTypeDef huart1;
UART_HandleTypeDef huart2;

/* USER CODE BEGIN PV */
// ---- IR receiver ----
volatile uint32_t ir_buf[IR_MAX_EDGES];
volatile uint16_t ir_count = 0;
volatile uint32_t ir_last_edge = 0;
volatile uint8_t  ir_started = 0, ir_overflow = 0, ir_from_tx = 0;

// ---- IR transmitter ----
uint32_t          tx_buf[IR_MAX_EDGES];
volatile uint16_t tx_count = 0, tx_index = 0;
volatile uint8_t  tx_busy = 0, tx_done = 0;
UART_HandleTypeDef *tx_reply_port = NULL;     // who gets ACK,SEND (NULL = B1 replay)

// ---- last captured code (for B1 replay) ----
uint32_t saved_buf[IR_MAX_EDGES];
uint16_t saved_count = 0;

// ---- LEARN state ----
uint8_t  learn_active = 0;
uint32_t learn_start = 0;
UART_HandleTypeDef *learn_port = NULL;

// ---- UART line receivers: one per port, each with its OWN command buffer ----
typedef struct {
  uint8_t  byte;               // 1-byte buffer for HAL_UART_Receive_IT
  char     buf[LINE_MAX];      // line being received
  uint16_t len;
  uint8_t  overflow;
  char     cmd[LINE_MAX];      // last complete line, waiting for the main loop
  volatile uint8_t  ready;     // cmd[] holds a new command
  volatile uint8_t  toolong;   // a line was longer than LINE_MAX
  volatile uint32_t bytes;     // statistics, for debugging the link
  volatile uint32_t dropped;
  volatile uint32_t errors;
} LineRx;
LineRx rx1, rx2;               // rx1 = USART1 (ESP32), rx2 = USART2 (PC)

volatile uint8_t  b1_request = 0;
volatile uint32_t last_press = 0;
char out[128];
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_USART2_UART_Init(void);
static void MX_TIM2_Init(void);
static void MX_TIM3_Init(void);
static void MX_TIM5_Init(void);
static void MX_USART1_UART_Init(void);
/* USER CODE BEGIN PFP */

/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */
// ======================= UART helpers =======================
static void send_str(UART_HandleTypeDef *h, const char *s)
{
  HAL_UART_Transmit(h, (uint8_t *)s, strlen(s), HAL_MAX_DELAY);
}

static void debug(const char *s)            // human-only messages, USART2 only
{
  send_str(&huart2, "# ");
  send_str(&huart2, s);
  send_str(&huart2, "\r\n");
}

static void send_code_line(UART_HandleTypeDef *h, const uint32_t *t, uint16_t n)
{
  sprintf(out, "CODE,%u", n);
  send_str(h, out);
  for (uint16_t i = 0; i < n; i++) {
    sprintf(out, ",%lu", t[i]);
    send_str(h, out);
  }
  send_str(h, "\r\n");
}

// Every received byte lands here; a full line becomes a command for that port
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
  LineRx *r = (huart->Instance == USART1) ? &rx1 : &rx2;
  char c = (char)r->byte;
  r->bytes++;

  if (c == '\r' || c == '\n') {
    if (r->overflow) {
      r->toolong = 1;
    } else if (r->len > 0) {
      if (!r->ready) {
        memcpy(r->cmd, r->buf, r->len);
        r->cmd[r->len] = '\0';
        r->ready = 1;
      } else {
        r->dropped++;              // main loop still busy with this port's previous command
      }
    }
    r->len = 0;
    r->overflow = 0;
  } else if (r->len < LINE_MAX - 1) {
    r->buf[r->len++] = c;
  } else {
    r->overflow = 1;
  }
  HAL_UART_Receive_IT(huart, &r->byte, 1);   // re-arm for the next byte
}

// On a UART error (noise, framing, overrun) HAL may stop receiving -> count it and restart
void HAL_UART_ErrorCallback(UART_HandleTypeDef *huart)
{
  LineRx *r = (huart->Instance == USART1) ? &rx1 : &rx2;
  r->errors++;
  r->len = 0;
  r->overflow = 0;
  HAL_UART_Receive_IT(huart, &r->byte, 1);
}
// ======================= IR transmitter =======================
static void carrier(uint8_t on)
{
  __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, on ? CARRIER_ON : 0);
}

static void ir_start_tx(UART_HandleTypeDef *reply_to)   // sends tx_buf[0..tx_count-1]
{
  tx_busy = 1;
  tx_index = 0;
  tx_reply_port = reply_to;
  carrier(1);
  __HAL_TIM_SET_AUTORELOAD(&htim5, tx_buf[0] - 1);
  __HAL_TIM_SET_COUNTER(&htim5, 0);
  __HAL_TIM_CLEAR_FLAG(&htim5, TIM_FLAG_UPDATE);
  HAL_TIM_Base_Start_IT(&htim5);
}

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
  if (htim->Instance == TIM5)
  {
    tx_index++;
    if (tx_index >= tx_count) {
      carrier(0);
      HAL_TIM_Base_Stop_IT(&htim5);
      tx_busy = 0;
      tx_done = 1;                       // main loop sends ACK,SEND
    } else {
      carrier((tx_index % 2) == 0);      // even = mark, odd = space
      __HAL_TIM_SET_AUTORELOAD(&htim5, tx_buf[tx_index] - 1);
    }
  }
}

// ======================= IR receiver =======================
void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim)
{
  if (htim->Instance == TIM2 && htim->Channel == HAL_TIM_ACTIVE_CHANNEL_1)
  {
    uint32_t now = HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1);
    if (!ir_started) {
      ir_started = 1;
      ir_from_tx = tx_busy;
    } else if (ir_count < IR_MAX_EDGES) {
      ir_buf[ir_count++] = now - ir_last_edge;
    } else {
      ir_overflow = 1;
    }
    ir_last_edge = now;
  }
}

// ======================= B1 button =======================
void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
  if (GPIO_Pin == B1_Pin) {
    uint32_t now = HAL_GetTick();
    if (now - last_press > 300) {
      last_press = now;
      b1_request = 1;
    }
  }
}

// ======================= Commands =======================
// Parse "SEND,<n>,<t1>,...,<tn>" into tx_buf. Returns n, or 0 if malformed.
static uint16_t parse_send(const char *s)
{
  char *p;
  unsigned long n = strtoul(s + 5, &p, 10);         // skip "SEND,"
  if (n == 0 || n > IR_MAX_EDGES) return 0;
  for (uint16_t i = 0; i < n; i++) {
    if (*p != ',') return 0;
    unsigned long v = strtoul(p + 1, &p, 10);
    if (v == 0 || v > 1000000) return 0;
    tx_buf[i] = v;
  }
  if (*p != '\0') return 0;                         // junk after the last number
  return (uint16_t)n;
}

static void handle_command(const char *c, UART_HandleTypeDef *h)
{
  if (strcmp(c, "PING") == 0) {
    send_str(h, "PONG\r\n");
  }
  else if (strcmp(c, "LEARN") == 0) {
    learn_active = 1;
    learn_start  = HAL_GetTick();
    learn_port   = h;
    debug("LEARN: tap a remote button at the receiver (10 s)");
  }
  else if (strcmp(c, "CANCEL") == 0) {
    learn_active = 0;
    send_str(h, "ACK,CANCEL\r\n");
  }
  else if (strncmp(c, "SEND,", 5) == 0) {
    if (tx_busy) { send_str(h, "ERR,SEND,BUSY\r\n"); return; }
    uint16_t n = parse_send(c);
    if (n == 0)  { send_str(h, "ERR,SEND,FORMAT\r\n"); return; }
    tx_count = n;
    ir_start_tx(h);                                 // ACK,SEND comes when it finishes
  }
  else {
    send_str(h, "ERR,UNKNOWN\r\n");
  }
}

// Run any command waiting on this port; replies go back to the same port
static void service_port(LineRx *r, UART_HandleTypeDef *h)
{
  if (r->ready) {
    handle_command(r->cmd, h);
    r->ready = 0;
  }
  if (r->toolong) {
    r->toolong = 0;
    send_str(h, "ERR,LINE,TOO_LONG\r\n");
  }
}
/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{

  /* USER CODE BEGIN 1 */

  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
  MX_USART2_UART_Init();
  MX_TIM2_Init();
  MX_TIM3_Init();
  MX_TIM5_Init();
  MX_USART1_UART_Init();
  /* USER CODE BEGIN 2 */
  HAL_UART_Receive_IT(&huart1, &rx1.byte, 1);
    HAL_UART_Receive_IT(&huart2, &rx2.byte, 1);
    HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
    HAL_TIM_IC_Start_IT(&htim2, TIM_CHANNEL_1);

    send_str(&huart1, "READY\r\n");
    send_str(&huart2, "READY\r\n");
    debug("IR command link. Commands: PING | LEARN | CANCEL | SEND,n,t1,...,tn");
  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
	  // 0) Safety net: if a UART stopped receiving (e.g. after an error), restart it
	      if (huart1.RxState == HAL_UART_STATE_READY) HAL_UART_Receive_IT(&huart1, &rx1.byte, 1);
	      if (huart2.RxState == HAL_UART_STATE_READY) HAL_UART_Receive_IT(&huart2, &rx2.byte, 1);

	      // 1) Commands from each port (independent, so one can't block the other)
	          service_port(&rx1, &huart1);
	          service_port(&rx2, &huart2);

	          // (debug) link statistics every 30 s, USART2 only
	          static uint32_t last_stats = 0;
	          if (HAL_GetTick() - last_stats > 30000) {
	            last_stats = HAL_GetTick();
	            sprintf(out, "stats: USART1 %lu bytes, %lu dropped, %lu errors | USART2 %lu bytes, %lu dropped, %lu errors",
	                    rx1.bytes, rx1.dropped, rx1.errors, rx2.bytes, rx2.dropped, rx2.errors);
	            debug(out);
	          }

	      // 2) Transmission finished -> acknowledge
	      if (tx_done) {
	        tx_done = 0;
	        if (tx_reply_port) send_str(tx_reply_port, "ACK,SEND\r\n");
	        else               debug("B1 replay sent");
	      }

	      // 3) LEARN timed out
	      if (learn_active && (HAL_GetTick() - learn_start > LEARN_TIMEOUT_MS)) {
	        learn_active = 0;
	        send_str(learn_port, "ERR,LEARN,TIMEOUT\r\n");
	      }

	      // 4) B1 -> replay the last captured code
	      if (b1_request) {
	        b1_request = 0;
	        if (saved_count == 0)  debug("nothing captured yet");
	        else if (tx_busy)      debug("busy");
	        else {
	          memcpy(tx_buf, saved_buf, saved_count * sizeof(uint32_t));
	          tx_count = saved_count;
	          ir_start_tx(NULL);
	        }
	      }

	      // 5) A received IR signal has finished
	      if (ir_started)
	      {
	        __disable_irq();
	        uint32_t last = ir_last_edge;
	        uint32_t now  = __HAL_TIM_GET_COUNTER(&htim2);
	        __enable_irq();

	        if (now - last > IR_END_GAP_US)
	        {
	          HAL_TIM_IC_Stop_IT(&htim2, TIM_CHANNEL_1);

	          if (ir_from_tx) {
	            sprintf(out, "loopback: heard %u of %u durations", ir_count, tx_count);
	            debug(out);
	          }
	          else if (ir_overflow) {
	            if (learn_active) {
	              learn_active = 0;
	              send_str(learn_port, "ERR,LEARN,TOO_LONG\r\n");
	            } else {
	              debug("signal too long - ignored");
	            }
	          }
	          else {
	            for (uint16_t i = 0; i < ir_count; i++) saved_buf[i] = ir_buf[i];
	            saved_count = ir_count;
	            if (learn_active) {
	              learn_active = 0;
	              send_code_line(learn_port, saved_buf, saved_count);
	            } else {
	              sprintf(out, "captured %u durations (press B1 to replay)", saved_count);
	              debug(out);
	            }
	          }
	          HAL_GPIO_TogglePin(LD2_GPIO_Port, LD2_Pin);

	          ir_count = 0; ir_started = 0; ir_overflow = 0; ir_from_tx = 0;
	          HAL_TIM_IC_Start_IT(&htim2, TIM_CHANNEL_1);
	        }
	      }
	    }   // <-- closes while (1). Keep this brace!
  /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Configure the main internal regulator output voltage
  */
  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI;
  RCC_OscInitStruct.PLL.PLLM = 8;
  RCC_OscInitStruct.PLL.PLLN = 100;
  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;
  RCC_OscInitStruct.PLL.PLLQ = 4;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_3) != HAL_OK)
  {
    Error_Handler();
  }
}

/**
  * @brief TIM2 Initialization Function
  * @param None
  * @retval None
  */
static void MX_TIM2_Init(void)
{

  /* USER CODE BEGIN TIM2_Init 0 */

  /* USER CODE END TIM2_Init 0 */

  TIM_ClockConfigTypeDef sClockSourceConfig = {0};
  TIM_MasterConfigTypeDef sMasterConfig = {0};
  TIM_IC_InitTypeDef sConfigIC = {0};

  /* USER CODE BEGIN TIM2_Init 1 */

  /* USER CODE END TIM2_Init 1 */
  htim2.Instance = TIM2;
  htim2.Init.Prescaler = 99;
  htim2.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim2.Init.Period = 4294967295;
  htim2.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
  htim2.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
  if (HAL_TIM_Base_Init(&htim2) != HAL_OK)
  {
    Error_Handler();
  }
  sClockSourceConfig.ClockSource = TIM_CLOCKSOURCE_INTERNAL;
  if (HAL_TIM_ConfigClockSource(&htim2, &sClockSourceConfig) != HAL_OK)
  {
    Error_Handler();
  }
  if (HAL_TIM_IC_Init(&htim2) != HAL_OK)
  {
    Error_Handler();
  }
  sMasterConfig.MasterOutputTrigger = TIM_TRGO_RESET;
  sMasterConfig.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;
  if (HAL_TIMEx_MasterConfigSynchronization(&htim2, &sMasterConfig) != HAL_OK)
  {
    Error_Handler();
  }
  sConfigIC.ICPolarity = TIM_INPUTCHANNELPOLARITY_BOTHEDGE;
  sConfigIC.ICSelection = TIM_ICSELECTION_DIRECTTI;
  sConfigIC.ICPrescaler = TIM_ICPSC_DIV1;
  sConfigIC.ICFilter = 0;
  if (HAL_TIM_IC_ConfigChannel(&htim2, &sConfigIC, TIM_CHANNEL_1) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN TIM2_Init 2 */

  /* USER CODE END TIM2_Init 2 */

}

/**
  * @brief TIM3 Initialization Function
  * @param None
  * @retval None
  */
static void MX_TIM3_Init(void)
{

  /* USER CODE BEGIN TIM3_Init 0 */

  /* USER CODE END TIM3_Init 0 */

  TIM_ClockConfigTypeDef sClockSourceConfig = {0};
  TIM_MasterConfigTypeDef sMasterConfig = {0};
  TIM_OC_InitTypeDef sConfigOC = {0};

  /* USER CODE BEGIN TIM3_Init 1 */

  /* USER CODE END TIM3_Init 1 */
  htim3.Instance = TIM3;
  htim3.Init.Prescaler = 0;
  htim3.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim3.Init.Period = 2631;
  htim3.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
  htim3.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
  if (HAL_TIM_Base_Init(&htim3) != HAL_OK)
  {
    Error_Handler();
  }
  sClockSourceConfig.ClockSource = TIM_CLOCKSOURCE_INTERNAL;
  if (HAL_TIM_ConfigClockSource(&htim3, &sClockSourceConfig) != HAL_OK)
  {
    Error_Handler();
  }
  if (HAL_TIM_PWM_Init(&htim3) != HAL_OK)
  {
    Error_Handler();
  }
  sMasterConfig.MasterOutputTrigger = TIM_TRGO_RESET;
  sMasterConfig.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;
  if (HAL_TIMEx_MasterConfigSynchronization(&htim3, &sMasterConfig) != HAL_OK)
  {
    Error_Handler();
  }
  sConfigOC.OCMode = TIM_OCMODE_PWM1;
  sConfigOC.Pulse = 0;
  sConfigOC.OCPolarity = TIM_OCPOLARITY_HIGH;
  sConfigOC.OCFastMode = TIM_OCFAST_DISABLE;
  if (HAL_TIM_PWM_ConfigChannel(&htim3, &sConfigOC, TIM_CHANNEL_1) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN TIM3_Init 2 */

  /* USER CODE END TIM3_Init 2 */
  HAL_TIM_MspPostInit(&htim3);

}

/**
  * @brief TIM5 Initialization Function
  * @param None
  * @retval None
  */
static void MX_TIM5_Init(void)
{

  /* USER CODE BEGIN TIM5_Init 0 */

  /* USER CODE END TIM5_Init 0 */

  TIM_ClockConfigTypeDef sClockSourceConfig = {0};
  TIM_MasterConfigTypeDef sMasterConfig = {0};

  /* USER CODE BEGIN TIM5_Init 1 */

  /* USER CODE END TIM5_Init 1 */
  htim5.Instance = TIM5;
  htim5.Init.Prescaler = 99;
  htim5.Init.CounterMode = TIM_COUNTERMODE_UP;
  htim5.Init.Period = 4294967295;
  htim5.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
  htim5.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
  if (HAL_TIM_Base_Init(&htim5) != HAL_OK)
  {
    Error_Handler();
  }
  sClockSourceConfig.ClockSource = TIM_CLOCKSOURCE_INTERNAL;
  if (HAL_TIM_ConfigClockSource(&htim5, &sClockSourceConfig) != HAL_OK)
  {
    Error_Handler();
  }
  sMasterConfig.MasterOutputTrigger = TIM_TRGO_RESET;
  sMasterConfig.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;
  if (HAL_TIMEx_MasterConfigSynchronization(&htim5, &sMasterConfig) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN TIM5_Init 2 */

  /* USER CODE END TIM5_Init 2 */

}

/**
  * @brief USART1 Initialization Function
  * @param None
  * @retval None
  */
static void MX_USART1_UART_Init(void)
{

  /* USER CODE BEGIN USART1_Init 0 */

  /* USER CODE END USART1_Init 0 */

  /* USER CODE BEGIN USART1_Init 1 */

  /* USER CODE END USART1_Init 1 */
  huart1.Instance = USART1;
  huart1.Init.BaudRate = 115200;
  huart1.Init.WordLength = UART_WORDLENGTH_8B;
  huart1.Init.StopBits = UART_STOPBITS_1;
  huart1.Init.Parity = UART_PARITY_NONE;
  huart1.Init.Mode = UART_MODE_TX_RX;
  huart1.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart1.Init.OverSampling = UART_OVERSAMPLING_16;
  if (HAL_UART_Init(&huart1) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART1_Init 2 */

  /* USER CODE END USART1_Init 2 */

}

/**
  * @brief USART2 Initialization Function
  * @param None
  * @retval None
  */
static void MX_USART2_UART_Init(void)
{

  /* USER CODE BEGIN USART2_Init 0 */

  /* USER CODE END USART2_Init 0 */

  /* USER CODE BEGIN USART2_Init 1 */

  /* USER CODE END USART2_Init 1 */
  huart2.Instance = USART2;
  huart2.Init.BaudRate = 115200;
  huart2.Init.WordLength = UART_WORDLENGTH_8B;
  huart2.Init.StopBits = UART_STOPBITS_1;
  huart2.Init.Parity = UART_PARITY_NONE;
  huart2.Init.Mode = UART_MODE_TX_RX;
  huart2.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart2.Init.OverSampling = UART_OVERSAMPLING_16;
  if (HAL_UART_Init(&huart2) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART2_Init 2 */

  /* USER CODE END USART2_Init 2 */

}

/**
  * @brief GPIO Initialization Function
  * @param None
  * @retval None
  */
static void MX_GPIO_Init(void)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  /* USER CODE BEGIN MX_GPIO_Init_1 */

  /* USER CODE END MX_GPIO_Init_1 */

  /* GPIO Ports Clock Enable */
  __HAL_RCC_GPIOC_CLK_ENABLE();
  __HAL_RCC_GPIOH_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();

  /*Configure GPIO pin Output Level */
  HAL_GPIO_WritePin(LD2_GPIO_Port, LD2_Pin, GPIO_PIN_RESET);

  /*Configure GPIO pin : B1_Pin */
  GPIO_InitStruct.Pin = B1_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_IT_FALLING;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(B1_GPIO_Port, &GPIO_InitStruct);

  /*Configure GPIO pin : LD2_Pin */
  GPIO_InitStruct.Pin = LD2_Pin;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(LD2_GPIO_Port, &GPIO_InitStruct);

  /* EXTI interrupt init*/
  HAL_NVIC_SetPriority(EXTI15_10_IRQn, 3, 0);
  HAL_NVIC_EnableIRQ(EXTI15_10_IRQn);

  /* USER CODE BEGIN MX_GPIO_Init_2 */

  /* USER CODE END MX_GPIO_Init_2 */
}

/* USER CODE BEGIN 4 */

/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}
#ifdef USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
