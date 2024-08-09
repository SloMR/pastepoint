use derive_more::{Display, From};
use actix_web::{HttpResponse, ResponseError};

#[derive(Debug, Display, From)]
pub enum AppError {
    #[display("Internal Server Error")]
    InternalServerError,
    #[display("Not Found")]
    NotFound,
    #[display("Bad Request: {}", _0)]
    BadRequest(String),
    #[display("Unauthorized")]
    Unauthorized,
    #[display("Forbidden")]
    Forbidden,
}

impl ResponseError for AppError {
    fn error_response(&self) -> HttpResponse {
        match *self {
            AppError::InternalServerError => {
                HttpResponse::InternalServerError().body("Internal Server Error")
            }
            AppError::NotFound => HttpResponse::NotFound().body("Not Found"),
            AppError::BadRequest(ref message) => HttpResponse::BadRequest().body(message.clone()),
            AppError::Unauthorized => HttpResponse::Unauthorized().body("Unauthorized"),
            AppError::Forbidden => HttpResponse::Forbidden().body("Forbidden"),
        }
    }
}