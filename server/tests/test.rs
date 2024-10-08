#[cfg(test)]
mod tests {
    use actix_web::{http::StatusCode, test, web, App, HttpResponse};

    async fn index() -> HttpResponse {
        HttpResponse::Ok().body("Hello, world!")
    }

    #[actix_rt::test]
    async fn test_index() {
        let app = test::init_service(App::new().route("/", web::get().to(index))).await;
        let req = test::TestRequest::get().uri("/").to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);

        let body = test::read_body(resp).await;
        assert_eq!(body, "Hello, world!");
    }
}
