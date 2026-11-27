//! Cloudflare API calls for the Cloudflare screen. The web view can't call api.cloudflare.com itself (CORS),
//! so the two calls it needs go through here: a GET on the REST API and a GraphQL analytics query.
//! The answer is handed back as it came (`{ status, body }`); the screen decides what an error means.

use serde_json::{json, Value};
use std::time::Duration;

const BASE: &str = "https://api.cloudflare.com/client/v4";

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("TermFreeUs")
        .build()
        .map_err(|e| e.to_string())
}

async fn finish(res: reqwest::Response) -> Result<Value, String> {
    let status = res.status().as_u16();
    let text = res.text().await.map_err(|e| e.to_string())?;
    let body: Value = serde_json::from_str(&text).unwrap_or_else(|_| json!({ "success": false, "errors": [{ "message": text.chars().take(200).collect::<String>() }] }));
    Ok(json!({ "status": status, "body": body }))
}

fn clean_token(token: &str) -> Result<String, String> {
    let t = token.trim();
    if t.is_empty() || t.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("Invalid API token".into());
    }
    Ok(t.to_string())
}

/// GET `/client/v4{path}` (path starts with `/`, e.g. `/zones?per_page=50`).
#[tauri::command]
pub async fn cf_get(token: String, path: String) -> Result<Value, String> {
    if !path.starts_with('/') || path.contains("://") || path.contains("..") {
        return Err("Invalid path".into());
    }
    let res = client()?
        .get(format!("{BASE}{path}"))
        .bearer_auth(clean_token(&token)?)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    finish(res).await
}

/// POST a GraphQL analytics query.
#[tauri::command]
pub async fn cf_graphql(token: String, query: String, variables: Value) -> Result<Value, String> {
    let res = client()?
        .post(format!("{BASE}/graphql"))
        .bearer_auth(clean_token(&token)?)
        .json(&json!({ "query": query, "variables": variables }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    finish(res).await
}
