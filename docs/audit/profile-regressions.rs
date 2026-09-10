// Append to src/profiles/mod.rs in an ISOLATED copy of the Rust crate.
// Run cargo test audit_regressions. These tests describe expected behavior
// and fail on the reviewed revision. They only use fresh temporary directories.
#[cfg(test)]
mod audit_regressions {
    use super::*;

    fn setup() -> (PathBuf, Database, ProfileStore) {
        let root = std::env::temp_dir().join(format!("reachpanel-audit-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let db = Database::new(root.clone()).unwrap();
        let store = ProfileStore::new(&root).unwrap();
        store.ensure_default_profile_file(&db).unwrap();
        db.update_profile_settings(INTERNAL_PROFILE_ID,
            r##"{"uiLanguage":"en","appBgColor":"#123456"}"##).unwrap();
        store.save_active_profile(&db).unwrap();
        (root, db, store)
    }

    #[test]
    fn deleting_custom_profile_preserves_existing_default() {
        let (root, db, store) = setup();
        let default = root.join("profiles/default.profile.json");
        let before = fs::read(&default).unwrap();
        store.create_profile_file(&db, "custom", "Custom").unwrap();
        store.delete_profile_file(&db, "custom.profile.json").unwrap();
        assert!(fs::read(&default).unwrap() == before,
            "Deleting Custom must not overwrite the unrelated Default profile");
    }

    #[test]
    fn failed_create_keeps_original_active_profile_and_settings() {
        let (_root, db, store) = setup();
        let before_file = store.active_filename().unwrap();
        let before_settings = db.get_profile_by_id(INTERNAL_PROFILE_ID).unwrap().unwrap().settings_json;
        assert!(store.create_profile_file(&db, "missing-directory/child", "Child").is_err());
        assert_eq!(store.active_filename().unwrap(), before_file,
            "A failed Create must leave the current profile active");
        assert_eq!(db.get_profile_by_id(INTERNAL_PROFILE_ID).unwrap().unwrap().settings_json,
            before_settings);
    }

    #[test]
    fn delete_rejects_paths_outside_profiles_directory() {
        let (root, db, store) = setup();
        let unrelated = root.join("unrelated.txt");
        fs::write(&unrelated, "must survive").unwrap();
        let result = store.delete_profile_file(&db, "../unrelated.txt");
        assert!(result.is_err(), "Profile delete accepted a path outside profiles");
        assert!(unrelated.exists());
    }
}
