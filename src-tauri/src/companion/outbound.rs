//! Latest-wins outbound slot for companion input preview frames.

use std::sync::Arc;
use tokio::sync::watch;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PreviewPush {
    Frame {
        data_url: String,
        width: u32,
        height: u32,
    },
    Cleared,
}

pub struct PreviewOutbound {
    tx: watch::Sender<Option<PreviewPush>>,
}

impl PreviewOutbound {
    pub fn new() -> Arc<Self> {
        let (tx, _rx) = watch::channel(None);
        Arc::new(Self { tx })
    }

    pub fn push(&self, event: PreviewPush) {
        // send_replace keeps the value even when no subscribers are attached yet.
        self.tx.send_replace(Some(event));
    }

    pub fn subscribe(&self) -> watch::Receiver<Option<PreviewPush>> {
        self.tx.subscribe()
    }

    pub fn latest(&self) -> Option<PreviewPush> {
        self.tx.borrow().clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latest_frame_wins() {
        let out = PreviewOutbound::new();
        out.push(PreviewPush::Frame {
            data_url: "a".into(),
            width: 1,
            height: 1,
        });
        out.push(PreviewPush::Frame {
            data_url: "b".into(),
            width: 2,
            height: 2,
        });
        match out.latest() {
            Some(PreviewPush::Frame {
                data_url,
                width,
                height,
            }) => {
                assert_eq!(data_url, "b");
                assert_eq!(width, 2);
                assert_eq!(height, 2);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn clear_replaces_frame() {
        let out = PreviewOutbound::new();
        out.push(PreviewPush::Frame {
            data_url: "a".into(),
            width: 1,
            height: 1,
        });
        out.push(PreviewPush::Cleared);
        assert!(matches!(out.latest(), Some(PreviewPush::Cleared)));
    }

    #[test]
    fn latest_survives_before_subscribe() {
        let out = PreviewOutbound::new();
        out.push(PreviewPush::Frame {
            data_url: "pre".into(),
            width: 3,
            height: 4,
        });
        let rx = out.subscribe();
        match out.latest() {
            Some(PreviewPush::Frame {
                data_url,
                width,
                height,
            }) => {
                assert_eq!(data_url, "pre");
                assert_eq!(width, 3);
                assert_eq!(height, 4);
            }
            other => panic!("unexpected {other:?}"),
        }
        let seen = rx.borrow().clone();
        match seen {
            Some(PreviewPush::Frame { data_url, .. }) => assert_eq!(data_url, "pre"),
            other => panic!("subscriber missed pre-subscribe frame: {other:?}"),
        }
    }
}
