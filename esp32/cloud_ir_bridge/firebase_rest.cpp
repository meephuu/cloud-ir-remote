#include "firebase_rest.h"

void FirebaseRest::begin(const char* databaseUrl, const char* authToken) {
  baseUrl_ = databaseUrl;
  while (baseUrl_.endsWith("/")) baseUrl_.remove(baseUrl_.length() - 1);
  auth_ = authToken ? authToken : "";
  // Skips checking Google's certificate. The traffic is still encrypted; fine for a lab project.
  tls_.setInsecure();
  http_.setReuse(true);
  http_.setTimeout(8000);
  http_.setConnectTimeout(8000);
}

int FirebaseRest::request(const char* method, const String& path, const String& query, const String& body,
                          String* response) {
  String url = baseUrl_ + path + ".json";
  String q = query;
  if (auth_.length()) {
    if (q.length()) q += '&';
    q += "auth=";
    q += auth_;
  }
  if (q.length()) url += "?" + q;

  if (!http_.begin(tls_, url)) {
    lastError = "could not start HTTPS request";
    return -1;
  }
  if (body.length()) http_.addHeader("Content-Type", "application/json");

  int code = http_.sendRequest(method, body);
  if (code > 0) {
    String payload = http_.getString();  // always read the body so the connection can be reused
    if (response) *response = payload;
    lastError = code >= 400 ? payload : "";
  } else {
    lastError = HTTPClient::errorToString(code);
  }
  http_.end();
  return code;
}

int FirebaseRest::get(const String& path, String& response, const String& query) {
  return request("GET", path, query, "", &response);
}

int FirebaseRest::put(const String& path, const String& json) { return request("PUT", path, "", json, nullptr); }

int FirebaseRest::patch(const String& path, const String& json) { return request("PATCH", path, "", json, nullptr); }

int FirebaseRest::post(const String& path, const String& json, String& response) {
  return request("POST", path, "", json, &response);
}
