use derive_more::{Display, From};
use actix_web::{HttpResponse, ResponseError};

#[derive(Debug, Display, From)]
pub enum MyError {
    #[display(fmt = "Internal Server Error")]
    InternalServerError,
}

impl ResponseError for MyError {
    fn error_response(&self) -> HttpResponse {
        match *self {
            MyError::InternalServerError => {
                HttpResponse::InternalServerError().body("Internal Server Error")
            }
        }
    }
}