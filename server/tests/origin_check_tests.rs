use actix_http::header::HeaderValue;
use server::ServerConfig;

#[test]
fn test_check_origin_allowed() {
    let mut config_https = ServerConfig::load(Some(false)).expect("load config");
    config_https.cors_allowed_origins = "https://pastepoint.com".to_string();
    let origin_https = HeaderValue::from_str("https://pastepoint.com").unwrap();
    assert!(config_https.check_origin(&origin_https));

    let mut config_http = ServerConfig::load(Some(false)).expect("load config");
    config_http.cors_allowed_origins = "http://pastepoint.com".to_string();
    let origin_http = HeaderValue::from_str("http://pastepoint.com").unwrap();
    assert!(config_http.check_origin(&origin_http));
}

#[test]
fn test_check_origin_allowed_www() {
    let mut config_https = ServerConfig::load(Some(false)).expect("load config");
    config_https.cors_allowed_origins = "https://www.pastepoint.com".to_string();
    let origin_https = HeaderValue::from_str("https://www.pastepoint.com").unwrap();
    assert!(config_https.check_origin(&origin_https));

    let mut config_http = ServerConfig::load(Some(false)).expect("load config");
    config_http.cors_allowed_origins = "http://www.pastepoint.com".to_string();
    let origin_http = HeaderValue::from_str("http://www.pastepoint.com").unwrap();
    assert!(config_http.check_origin(&origin_http));
}

#[test]
fn test_check_origin_subdomain() {
    let mut config_https = ServerConfig::load(Some(false)).expect("load config");
    config_https.cors_allowed_origins = "https://pastepoint.com".to_string();
    let origin_https = HeaderValue::from_str("https://sub.pastepoint.com").unwrap();
    assert!(config_https.check_origin(&origin_https));

    let mut config_http = ServerConfig::load(Some(false)).expect("load config");
    config_http.cors_allowed_origins = "http://pastepoint.com".to_string();
    let origin_http = HeaderValue::from_str("http://sub.pastepoint.com").unwrap();
    assert!(config_http.check_origin(&origin_http));
}

#[test]
fn test_check_origin_spoofed() {
    let mut config_https = ServerConfig::load(Some(false)).expect("load config");
    config_https.cors_allowed_origins = "https://pastepoint.com".to_string();
    let origin_https = HeaderValue::from_str("https://pastepoint.com.evil.com").unwrap();
    assert!(!config_https.check_origin(&origin_https));

    let mut config_http = ServerConfig::load(Some(false)).expect("load config");
    config_http.cors_allowed_origins = "http://pastepoint.com".to_string();
    let origin_http = HeaderValue::from_str("http://pastepoint.com.evil.com").unwrap();
    assert!(!config_http.check_origin(&origin_http));
}
