#[cfg(test)]
mod tests {
    use actix_web::{test, App, HttpResponse, web, http::StatusCode};

    async fn index() -> HttpResponse {
        HttpResponse::Ok().body("Hello, world!")
    }

    #[actix_rt::test]
    async fn test_index() {
        let mut app = test::init_service(App::new().route("/", web::get().to(index))).await;
        let req = test::TestRequest::get().uri("/").to_request();
        let resp = test::call_service(&mut app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);

        let body = test::read_body(resp).await;
        assert_eq!(body, "Hello, world!");
    }
}