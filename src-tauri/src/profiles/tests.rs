use super::*;
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_dir() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("reach-panel-profile-test-{nanos}"));
    fs::create_dir_all(&dir).expect("temp dir");
    dir
}

fn write_profile(dir: &Path, filename: &str, name: &str, marker: &str) {
    let file = ProfileFile {
        name: name.to_string(),
        settings: json!({
            "uiLanguage": "en",
            "appBgColor": marker,
            "groqApiKey": format!("key-{marker}"),
        }),
        predictions: vec![],
    };
    fs::write(
        dir.join("profiles").join(filename),
        serde_json::to_string_pretty(&file).unwrap(),
    )
    .unwrap();
}

#[test]
fn switch_then_save_does_not_clobber_previous_profile() {
    let root = temp_dir();
    let db = Database::new(root.clone()).expect("db");
    fs::create_dir_all(root.join("profiles")).unwrap();

    write_profile(&root, "a.profile.json", "A", "#aaa");
    write_profile(&root, "b.profile.json", "B", "#bbb");
    fs::write(
        root.join("profiles").join(ACTIVE_PROFILE_CONFIG),
        "a.profile.json",
    )
    .unwrap();

    // Re-read active after writing config.
    let store = ProfileStore::new(&root).expect("store");
    store
        .load_profile_file(&db, "a.profile.json")
        .expect("load a");

    // Simulate the race window: import B into DB, then save while still
    // pointing at A would historically overwrite A. With the IO lock,
    // load completes (active=B) before any save can run.
    store
        .load_profile_file(&db, "b.profile.json")
        .expect("load b");
    store.save_active_profile(&db).expect("save");

    let a: ProfileFile = serde_json::from_str(
        &fs::read_to_string(root.join("profiles").join("a.profile.json")).unwrap(),
    )
    .unwrap();
    let b: ProfileFile = serde_json::from_str(
        &fs::read_to_string(root.join("profiles").join("b.profile.json")).unwrap(),
    )
    .unwrap();

    assert_eq!(
        a.settings.get("appBgColor").and_then(|v| v.as_str()),
        Some("#aaa")
    );
    assert_eq!(
        a.settings.get("groqApiKey").and_then(|v| v.as_str()),
        Some("key-#aaa")
    );
    assert_eq!(
        b.settings.get("appBgColor").and_then(|v| v.as_str()),
        Some("#bbb")
    );
    assert_eq!(store.active_filename().unwrap(), "b.profile.json");

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn round_trip_switch_preserves_custom_settings() {
    let root = temp_dir();
    let db = Database::new(root.clone()).expect("db");
    fs::create_dir_all(root.join("profiles")).unwrap();

    write_profile(&root, "a.profile.json", "A", "#aaa");
    write_profile(&root, "b.profile.json", "B", "#bbb");
    fs::write(
        root.join("profiles").join(ACTIVE_PROFILE_CONFIG),
        "a.profile.json",
    )
    .unwrap();

    let store = ProfileStore::new(&root).expect("store");
    store
        .load_profile_file(&db, "a.profile.json")
        .expect("load a");

    // Mutate active (A) settings and persist.
    db.update_profile_settings(
        INTERNAL_PROFILE_ID,
        &serde_json::json!({
            "uiLanguage": "en",
            "appBgColor": "#custom-a",
            "groqApiKey": "secret-a",
        })
        .to_string(),
    )
    .unwrap();
    store.save_active_profile(&db).expect("save a");

    store
        .load_profile_file(&db, "b.profile.json")
        .expect("load b");
    store
        .load_profile_file(&db, "a.profile.json")
        .expect("load a again");

    let profile = db.get_profile_by_id(INTERNAL_PROFILE_ID).unwrap().unwrap();
    let settings: serde_json::Value = serde_json::from_str(&profile.settings_json).unwrap();
    assert_eq!(
        settings.get("appBgColor").and_then(|v| v.as_str()),
        Some("#custom-a")
    );
    assert_eq!(
        settings.get("groqApiKey").and_then(|v| v.as_str()),
        Some("secret-a")
    );
    assert_eq!(store.active_filename().unwrap(), "a.profile.json");

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn concurrent_switch_and_save_keeps_profiles_isolated() {
    use std::sync::Arc;
    use std::thread;

    let root = temp_dir();
    let db = Arc::new(Database::new(root.clone()).expect("db"));
    fs::create_dir_all(root.join("profiles")).unwrap();
    write_profile(&root, "a.profile.json", "A", "#aaa");
    write_profile(&root, "b.profile.json", "B", "#bbb");
    fs::write(
        root.join("profiles").join(ACTIVE_PROFILE_CONFIG),
        "a.profile.json",
    )
    .unwrap();

    let store = Arc::new(ProfileStore::new(&root).expect("store"));
    store
        .load_profile_file(&db, "a.profile.json")
        .expect("load a");

    let mut handles = Vec::new();
    for i in 0..8 {
        let store = Arc::clone(&store);
        let db = Arc::clone(&db);
        handles.push(thread::spawn(move || {
            if i % 2 == 0 {
                store
                    .load_profile_file(&db, "b.profile.json")
                    .expect("load b");
            } else {
                store.save_active_profile(&db).expect("save");
            }
        }));
    }
    for handle in handles {
        handle.join().expect("thread");
    }

    // Final explicit switch + save should leave both files self-consistent.
    store
        .load_profile_file(&db, "a.profile.json")
        .expect("load a final");
    store.save_active_profile(&db).expect("save a final");
    store
        .load_profile_file(&db, "b.profile.json")
        .expect("load b final");
    store.save_active_profile(&db).expect("save b final");

    let a: ProfileFile = serde_json::from_str(
        &fs::read_to_string(root.join("profiles").join("a.profile.json")).unwrap(),
    )
    .unwrap();
    let b: ProfileFile = serde_json::from_str(
        &fs::read_to_string(root.join("profiles").join("b.profile.json")).unwrap(),
    )
    .unwrap();

    let a_color = a
        .settings
        .get("appBgColor")
        .and_then(|v| v.as_str())
        .unwrap();
    let b_color = b
        .settings
        .get("appBgColor")
        .and_then(|v| v.as_str())
        .unwrap();
    // Neither file should contain the other profile's original marker after a
    // clean final load/save of each.
    assert!(
        a_color == "#aaa" || a_color == "#bbb",
        "unexpected a color {a_color}"
    );
    assert_eq!(b_color, "#bbb");
    // A must not have been permanently replaced with B's identity if we
    // finished on a clean load of A then B — B stays B; A stays A's marker
    // unless a save raced after loading B into the shared DB *before* active
    // was updated. The IO lock forbids that corruption path.
    assert_eq!(a_color, "#aaa");

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn import_tolerates_legacy_head_tracking_and_phrase_fields() {
    let root = temp_dir();
    let db = Database::new(root.clone()).expect("db");
    fs::create_dir_all(root.join("profiles")).unwrap();
    let legacy = json!({
        "name": "Legacy",
        "settings": {
            "uiLanguage": "en",
            "appBgColor": "#legacy",
            "quickActionsVisible": true,
            "phrasesVisible": true,
            "largeHeaders": true,
            "headTrackingEnabled": true,
            "emergencyVisible": true,
            "precisionMode": true
        },
        "quick_actions": [],
        "phrase_categories": [],
        "phrases": [],
        "macros": [],
        "predictions": [],
        "head_tracking_settings": { "sensitivity": 5 }
    });
    fs::write(
        root.join("profiles").join("legacy.profile.json"),
        serde_json::to_string_pretty(&legacy).unwrap(),
    )
    .unwrap();
    let store = ProfileStore::new(&root).expect("store");
    store
        .load_profile_file(&db, "legacy.profile.json")
        .expect("legacy import");
    let exported = export_profile_from_db(&db, INTERNAL_PROFILE_ID).expect("export");
    let wire = serde_json::to_value(&exported).unwrap();
    assert!(wire.get("head_tracking_settings").is_none());
    assert!(wire.get("phrases").is_none());
    assert!(wire.get("quick_actions").is_none());
    assert_eq!(
        exported
            .settings
            .get("appBgColor")
            .and_then(|v| v.as_str()),
        Some("#legacy")
    );
    for key in [
        "quickActionsVisible",
        "phrasesVisible",
        "largeHeaders",
        "headTrackingEnabled",
        "emergencyVisible",
        "precisionMode",
    ] {
        assert!(
            exported.settings.get(key).is_none(),
            "removed setting {key} must not survive import/export"
        );
    }
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn save_without_active_profile_errors() {
    let root = temp_dir();
    let db = Database::new(root.clone()).expect("db");
    let store = ProfileStore::new(&root).expect("store");
    let err = store.save_active_profile(&db).expect_err("should fail");
    assert!(err.to_string().contains("No active profile file to save"));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn deleting_custom_profile_preserves_existing_default() {
    let root = temp_dir();
    let db = Database::new(root.clone()).expect("db");
    let store = ProfileStore::new(&root).expect("store");
    store.ensure_default_profile_file(&db).unwrap();
    db.update_profile_settings(
        INTERNAL_PROFILE_ID,
        r##"{"uiLanguage":"en","appBgColor":"#123456"}"##,
    )
    .unwrap();
    store.save_active_profile(&db).unwrap();

    let default = root.join("profiles").join(DEFAULT_PROFILE_FILENAME);
    let before = fs::read(&default).unwrap();

    store.create_profile_file(&db, "custom", "Custom").unwrap();
    store
        .delete_profile_file(&db, "custom.profile.json")
        .unwrap();

    assert_eq!(
        fs::read(&default).unwrap(),
        before,
        "Deleting Custom must not overwrite the unrelated Default profile"
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn failed_create_keeps_original_active_profile_and_settings() {
    let root = temp_dir();
    let db = Database::new(root.clone()).expect("db");
    let store = ProfileStore::new(&root).expect("store");
    store.ensure_default_profile_file(&db).unwrap();
    db.update_profile_settings(
        INTERNAL_PROFILE_ID,
        r##"{"uiLanguage":"en","appBgColor":"#123456"}"##,
    )
    .unwrap();
    store.save_active_profile(&db).unwrap();

    let before_file = store.active_filename().unwrap();
    let before_settings = db
        .get_profile_by_id(INTERNAL_PROFILE_ID)
        .unwrap()
        .unwrap()
        .settings_json;

    assert!(store
        .create_profile_file(&db, "missing-directory/child", "Child")
        .is_err());
    assert_eq!(
        store.active_filename().unwrap(),
        before_file,
        "A failed Create must leave the current profile active"
    );
    assert_eq!(
        db.get_profile_by_id(INTERNAL_PROFILE_ID)
            .unwrap()
            .unwrap()
            .settings_json,
        before_settings
    );

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn delete_rejects_paths_outside_profiles_directory() {
    let root = temp_dir();
    let db = Database::new(root.clone()).expect("db");
    let store = ProfileStore::new(&root).expect("store");
    store.ensure_default_profile_file(&db).unwrap();

    let unrelated = root.join("unrelated.txt");
    fs::write(&unrelated, "must survive").unwrap();

    let result = store.delete_profile_file(&db, "../unrelated.txt");
    assert!(
        result.is_err(),
        "Profile delete accepted a path outside profiles"
    );
    assert!(unrelated.exists());
    assert_eq!(fs::read_to_string(&unrelated).unwrap(), "must survive");

    let _ = fs::remove_dir_all(&root);
}