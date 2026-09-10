// Append to src/services/profile_snapshot.rs in an isolated Rust crate copy.
#[cfg(test)]
mod audit_snapshot_regression {
    use super::*;

    #[test]
    fn serialized_tablet_snapshot_contains_no_host_api_key() {
        let root = std::env::temp_dir().join(format!("reachpanel-snapshot-audit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let db = Database::new(root).unwrap();
        db.ensure_internal_profile("active", "Audit", "en").unwrap();
        db.update_profile_settings("active",
            r#"{"uiLanguage":"en","groqApiKey":"AUDIT_SENTINEL_NOT_A_REAL_KEY"}"#).unwrap();
        let snapshot = build_profile_snapshot(&db, "active", "en").unwrap();
        assert!(snapshot.settings.get("groqApiKey").is_none());
        let wire = serde_json::to_string(&snapshot).unwrap();
        assert!(!wire.contains("AUDIT_SENTINEL_NOT_A_REAL_KEY"),
            "Host API key leaked through profile.settings_json despite sanitized settings");
    }
}
