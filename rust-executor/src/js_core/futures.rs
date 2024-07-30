use deno_core::anyhow::Error;
use deno_core::error::AnyError;
use deno_core::v8::Handle;
use deno_core::{anyhow, v8, JsRuntime, PollEventLoopOptions};
use deno_runtime::worker::MainWorker;
use log::info; // Import the JsRuntime struct.
use futures::{Future, FutureExt};
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::thread::sleep;
use tokio::sync::Mutex as TokioMutex;

pub struct EventLoopFuture {
    worker: Arc<TokioMutex<MainWorker>>,
}

impl EventLoopFuture {
    pub fn new(worker: Arc<TokioMutex<MainWorker>>) -> Self {
        EventLoopFuture { worker }
    }
}

impl Future for EventLoopFuture {
    type Output = Result<(), AnyError>; // You can customize the output type.

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        sleep(std::time::Duration::from_millis(1));
        let worker = self.worker.try_lock();
        if let Ok(mut worker) = worker {
            let res = worker.js_runtime.poll_event_loop(cx, PollEventLoopOptions {
                pump_v8_message_loop: true,
                wait_for_inspector: false,
            });
            cx.waker().wake_by_ref();
            res
        } else {
            Poll::Pending
        }
    }
}

pub struct SmartGlobalVariableFuture<F>
where
    F: Future<Output = Result<v8::Global<v8::Value>, AnyError>> + Unpin,
{
    worker: Arc<TokioMutex<MainWorker>>,
    value: F,
}

impl<F> SmartGlobalVariableFuture<F>
where
    F: Future<Output = Result<v8::Global<v8::Value>, AnyError>> + Unpin,
{
    pub fn new(worker: Arc<TokioMutex<MainWorker>>, value: F) -> Self {
        SmartGlobalVariableFuture { worker, value }
    }
}

impl<F> Future for SmartGlobalVariableFuture<F>
where
    F: Future<Output = Result<v8::Global<v8::Value>, AnyError>> + Unpin,
{
    type Output = Result<String, AnyError>;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let worker = self.worker.clone();
        let mut worker = match worker.try_lock() {
            Ok(w) => w,
            Err(_) => return Poll::Pending,
        };

        let mut value_pin = Pin::new(&mut self.value);
        
        if let Poll::Ready(result) = value_pin.as_mut().poll(cx) {
            match result {
                Ok(result) => {
                    let scope = &mut worker.js_runtime.handle_scope();
                    let result = result.open(scope).to_rust_string_lossy(scope);
                    return Poll::Ready(Ok(result));
                },
                Err(err) => return Poll::Ready(Err(err)),
            };
        }

        if let Poll::Ready(event_loop_result) = &mut worker.js_runtime.poll_event_loop(cx, deno_core::PollEventLoopOptions::default()) {
            if let Err(err) = event_loop_result {
                return Poll::Ready(Err(anyhow::anyhow!("Error polling event loop: {:?}", err)));
            }

            if let Poll::Ready(result) = value_pin.poll(cx) {
                match result {
                    Ok(result) => {
                        let scope = &mut worker.js_runtime.handle_scope();
                        let result = result.open(scope).to_rust_string_lossy(scope);
                        return Poll::Ready(Ok(result));
                    },
                    Err(err) => return Poll::Ready(Err(err)),
                };
            }

            return Poll::Ready(Err(anyhow::anyhow!("Promise resolution is still pending but the event loop has already resolved.")));
        }

        Poll::Pending
    }
}