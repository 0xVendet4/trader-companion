// macOS speech recognition via AVFoundation + Speech framework ObjC FFI.
// On other platforms the commands are stubs that return "not-available".

#[cfg(target_os = "macos")]
mod macos_impl {
    use std::ffi::{c_char, c_void, CStr, CString};
    use std::sync::Mutex;
    use tauri::{AppHandle, Emitter};

    // ── Framework links ───────────────────────────────────────────────────────

    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {}

    #[link(name = "Speech", kind = "framework")]
    extern "C" {}

    #[link(name = "Foundation", kind = "framework")]
    extern "C" {}

    #[link(name = "objc")]
    extern "C" {
        fn sel_registerName(name: *const c_char) -> *const c_void;
        fn objc_getClass(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
        static _NSConcreteStackBlock: c_void;
    }

    // ── ObjC messaging helpers ────────────────────────────────────────────────

    fn sel(name: &CStr) -> *const c_void {
        unsafe { sel_registerName(name.as_ptr()) }
    }

    fn class(name: &CStr) -> *mut c_void {
        unsafe { objc_getClass(name.as_ptr()) }
    }

    unsafe fn msg0(obj: *mut c_void, s: *const c_void) -> *mut c_void {
        let f: unsafe extern "C" fn(*mut c_void, *const c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f(obj, s)
    }

    unsafe fn msg1(obj: *mut c_void, s: *const c_void, a: *mut c_void) -> *mut c_void {
        let f: unsafe extern "C" fn(*mut c_void, *const c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f(obj, s, a)
    }

    unsafe fn msg2(obj: *mut c_void, s: *const c_void, a: *mut c_void, b: *mut c_void) -> *mut c_void {
        let f: unsafe extern "C" fn(*mut c_void, *const c_void, *mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        f(obj, s, a, b)
    }

    unsafe fn msg0_bool(obj: *mut c_void, s: *const c_void) -> bool {
        let f: unsafe extern "C" fn(*mut c_void, *const c_void) -> bool =
            std::mem::transmute(objc_msgSend as *const ());
        f(obj, s)
    }

    unsafe fn msg1_f32(obj: *mut c_void, s: *const c_void, channel: i32) -> f32 {
        let f: unsafe extern "C" fn(*mut c_void, *const c_void, i32) -> f32 =
            std::mem::transmute(objc_msgSend as *const ());
        f(obj, s, channel)
    }

    unsafe fn msg0_i64(obj: *mut c_void, s: *const c_void) -> i64 {
        let f: unsafe extern "C" fn(*mut c_void, *const c_void) -> i64 =
            std::mem::transmute(objc_msgSend as *const ());
        f(obj, s)
    }

    unsafe fn msg_bool_set(obj: *mut c_void, s: *const c_void, v: bool) {
        let f: unsafe extern "C" fn(*mut c_void, *const c_void, bool) =
            std::mem::transmute(objc_msgSend as *const ());
        f(obj, s, v)
    }

    // ── NSString ──────────────────────────────────────────────────────────────

    fn ns_string(s: &str) -> *mut c_void {
        let cstr = CString::new(s).unwrap_or_default();
        unsafe {
            let cls = class(c"NSString");
            let alloc = msg0(cls, sel(c"alloc"));
            let f: unsafe extern "C" fn(*mut c_void, *const c_void, *const c_char, i64) -> *mut c_void =
                std::mem::transmute(objc_msgSend as *const ());
            f(alloc, sel(c"initWithCString:encoding:"), cstr.as_ptr(), 4)
        }
    }

    unsafe fn ns_string_to_rust(ns: *mut c_void) -> String {
        if ns.is_null() { return String::new(); }
        let f: unsafe extern "C" fn(*mut c_void, *const c_void) -> *const c_char =
            std::mem::transmute(objc_msgSend as *const ());
        let ptr = f(ns, sel(c"UTF8String"));
        if ptr.is_null() { return String::new(); }
        CStr::from_ptr(ptr).to_string_lossy().into_owned()
    }

    fn nsurl_file(path: &str) -> *mut c_void {
        let ns = ns_string(path);
        unsafe {
            let cls = class(c"NSURL");
            msg1(cls, sel(c"fileURLWithPath:"), ns)
        }
    }

    // ── AVAudioRecorder settings dictionary ───────────────────────────────────

    fn recorder_settings() -> *mut c_void {
        unsafe {
            let dict = msg0(msg0(class(c"NSMutableDictionary"), sel(c"alloc")), sel(c"init"));
            let num_cls = class(c"NSNumber");
            let num_i = |v: i64| -> *mut c_void {
                let f: unsafe extern "C" fn(*mut c_void, *const c_void, i64) -> *mut c_void =
                    std::mem::transmute(objc_msgSend as *const ());
                f(num_cls, sel(c"numberWithInteger:"), v)
            };
            let num_f = |v: f64| -> *mut c_void {
                let f: unsafe extern "C" fn(*mut c_void, *const c_void, f64) -> *mut c_void =
                    std::mem::transmute(objc_msgSend as *const ());
                f(num_cls, sel(c"numberWithDouble:"), v)
            };
            let num_b = |v: bool| -> *mut c_void {
                let f: unsafe extern "C" fn(*mut c_void, *const c_void, bool) -> *mut c_void =
                    std::mem::transmute(objc_msgSend as *const ());
                f(num_cls, sel(c"numberWithBool:"), v)
            };
            let set = sel(c"setObject:forKey:");
            // kAudioFormatLinearPCM = 1819304813
            msg2(dict, set, num_i(1819304813), ns_string("AVFormatIDKey"));
            msg2(dict, set, num_f(16000.0), ns_string("AVSampleRateKey"));
            msg2(dict, set, num_i(1), ns_string("AVNumberOfChannelsKey"));
            msg2(dict, set, num_i(16), ns_string("AVLinearPCMBitDepthKey"));
            msg2(dict, set, num_b(false), ns_string("AVLinearPCMIsFloatKey"));
            dict
        }
    }

    // ── ObjC blocks ──────────────────────────────────────────────────────────

    #[repr(C)]
    struct BlockDescriptor {
        reserved: u64,
        size: u64,
    }

    // ── Auth block ────────────────────────────────────────────────────────────

    #[repr(C)]
    struct AuthBlock {
        isa: *const c_void,
        flags: i32,
        reserved: i32,
        invoke: unsafe extern "C" fn(*mut AuthBlock, i64),
        descriptor: *const BlockDescriptor,
    }
    unsafe impl Send for AuthBlock {}
    unsafe impl Sync for AuthBlock {}

    static AUTH_BLOCK_DESC: BlockDescriptor = BlockDescriptor {
        reserved: 0,
        size: std::mem::size_of::<AuthBlock>() as u64,
    };

    struct AuthSlot {
        sender: Option<std::sync::mpsc::SyncSender<i64>>,
    }
    static AUTH_SLOT: Mutex<AuthSlot> = Mutex::new(AuthSlot { sender: None });

    unsafe extern "C" fn auth_invoke(_block: *mut AuthBlock, status: i64) {
        let mut slot = AUTH_SLOT.lock().unwrap();
        if let Some(tx) = slot.sender.take() {
            let _ = tx.send(status);
        }
    }

    // ── Result block ──────────────────────────────────────────────────────────

    #[repr(C)]
    struct ResultBlock {
        isa: *const c_void,
        flags: i32,
        reserved: i32,
        invoke: unsafe extern "C" fn(*mut ResultBlock, *mut c_void, *mut c_void),
        descriptor: *const BlockDescriptor,
    }
    unsafe impl Send for ResultBlock {}
    unsafe impl Sync for ResultBlock {}

    static RESULT_BLOCK_DESC: BlockDescriptor = BlockDescriptor {
        reserved: 0,
        size: std::mem::size_of::<ResultBlock>() as u64,
    };

    unsafe extern "C" fn result_invoke(
        _block: *mut ResultBlock,
        result: *mut c_void,
        error: *mut c_void,
    ) {
        let is_final = if !result.is_null() {
            msg0_bool(result, sel(c"isFinal"))
        } else {
            true
        };
        if !is_final { return; }

        let app_opt = VOICE_STATE.lock().unwrap().take().map(|s| s.app);
        let Some(app) = app_opt else { return };

        if !result.is_null() {
            let transcription = msg0(result, sel(c"bestTranscription"));
            let text = if !transcription.is_null() {
                ns_string_to_rust(msg0(transcription, sel(c"formattedString")))
            } else {
                String::new()
            };
            if text.trim().is_empty() {
                let _ = app.emit("voice-transcript", serde_json::json!({"error": "no-speech"}));
            } else {
                let _ = app.emit("voice-transcript", serde_json::json!({"text": text}));
            }
        } else if !error.is_null() {
            let domain = ns_string_to_rust(msg0(error, sel(c"domain")));
            let code = msg0_i64(error, sel(c"code"));
            crate::log::line(&format!("[speech] error domain={domain} code={code}"));
            let msg = if code == 201 || domain.contains("kAFAssistant") {
                "permission-denied"
            } else if code == 1110 {
                "no-speech"
            } else {
                "recognition-error"
            };
            let _ = app.emit("voice-transcript", serde_json::json!({"error": msg}));
        } else {
            let _ = app.emit("voice-transcript", serde_json::json!({"error": "unknown"}));
        }
    }

    // ── Shared state ──────────────────────────────────────────────────────────

    struct VoiceStateInner {
        app: AppHandle,
        recorder_ptr: usize,
        audio_path: String,
    }

    static VOICE_STATE: Mutex<Option<VoiceStateInner>> = Mutex::new(None);

    // ── Authorization ─────────────────────────────────────────────────────────

    fn request_speech_auth() -> i64 {
        let (tx, rx) = std::sync::mpsc::sync_channel::<i64>(1);
        AUTH_SLOT.lock().unwrap().sender = Some(tx);

        let block = Box::new(AuthBlock {
            isa: unsafe { &_NSConcreteStackBlock as *const _ as *const c_void },
            flags: 0,
            reserved: 0,
            invoke: auth_invoke,
            descriptor: &AUTH_BLOCK_DESC,
        });
        let block_ptr = Box::into_raw(block);

        unsafe {
            let f: unsafe extern "C" fn(*mut c_void, *const c_void, *mut AuthBlock) =
                std::mem::transmute(objc_msgSend as *const ());
            f(class(c"SFSpeechRecognizer"), sel(c"requestAuthorization:"), block_ptr);
        }

        rx.recv_timeout(std::time::Duration::from_secs(30)).unwrap_or(1)
    }

    // ── start / stop ─────────────────────────────────────────────────────────

    pub fn start(app: AppHandle) -> Result<(), String> {
        if VOICE_STATE.lock().unwrap().is_some() {
            return Err("already-listening".into());
        }

        let status = request_speech_auth();
        if status != 3 {
            return Err(if status == 1 || status == 2 { "permission-denied" } else { "speech-auth-failed" }.into());
        }

        let audio_path = std::env::temp_dir().join("candy_voice.wav").to_string_lossy().into_owned();

        let recorder = unsafe {
            let url = nsurl_file(&audio_path);
            let settings = recorder_settings();
            let cls = class(c"AVAudioRecorder");
            let alloc = msg0(cls, sel(c"alloc"));
            let f: unsafe extern "C" fn(*mut c_void, *const c_void, *mut c_void, *mut c_void, *mut c_void) -> *mut c_void =
                std::mem::transmute(objc_msgSend as *const ());
            let rec = f(alloc, sel(c"initWithURL:settings:error:"), url, settings, std::ptr::null_mut());
            if rec.is_null() {
                return Err("recorder-init-failed".into());
            }
            msg_bool_set(rec, sel(c"setMeteringEnabled:"), true);
            if !msg0_bool(rec, sel(c"record")) {
                return Err("recorder-start-failed".into());
            }
            rec
        };

        let recorder_ptr = recorder as usize;
        *VOICE_STATE.lock().unwrap() = Some(VoiceStateInner {
            app: app.clone(),
            recorder_ptr,
            audio_path: audio_path.clone(),
        });

        // Silence detection thread
        std::thread::spawn(move || {
            const SILENCE_DB: f32 = -40.0;
            const SILENCE_MS: u64 = 1200;
            const MAX_MS: u64 = 60_000;
            let mut silent_ms = 0u64;
            let mut elapsed_ms = 0u64;

            loop {
                std::thread::sleep(std::time::Duration::from_millis(150));
                elapsed_ms += 150;

                let still_active = VOICE_STATE
                    .lock()
                    .unwrap()
                    .as_ref()
                    .map(|s| s.recorder_ptr)
                    == Some(recorder_ptr);
                if !still_active { break; }

                let avg_power = unsafe {
                    let rec = recorder_ptr as *mut c_void;
                    let f_upd: unsafe extern "C" fn(*mut c_void, *const c_void) =
                        std::mem::transmute(objc_msgSend as *const ());
                    f_upd(rec, sel(c"updateMeters"));
                    msg1_f32(rec, sel(c"averagePowerForChannel:"), 0)
                };

                if avg_power < SILENCE_DB { silent_ms += 150; } else { silent_ms = 0; }

                if silent_ms >= SILENCE_MS || elapsed_ms >= MAX_MS {
                    stop_and_transcribe();
                    break;
                }
            }
        });

        Ok(())
    }

    fn stop_and_transcribe() {
        let inner = match VOICE_STATE.lock().unwrap().take() {
            Some(s) if s.recorder_ptr != 0 => s,
            _ => return,
        };

        // Stop recorder
        unsafe {
            let rec = inner.recorder_ptr as *mut c_void;
            let f: unsafe extern "C" fn(*mut c_void, *const c_void) =
                std::mem::transmute(objc_msgSend as *const ());
            f(rec, sel(c"stop"));
        }

        let audio_path = inner.audio_path.clone();
        let app = inner.app.clone();

        // Sentinel: recorder_ptr = 0 = "transcribing"
        *VOICE_STATE.lock().unwrap() = Some(VoiceStateInner {
            app: app.clone(),
            recorder_ptr: 0,
            audio_path: audio_path.clone(),
        });

        std::thread::spawn(move || {
            unsafe {
                let locale_id = ns_string("pt-BR");
                let locale = msg1(
                    class(c"NSLocale"),
                    sel(c"localeWithLocaleIdentifier:"),
                    locale_id,
                );
                let recognizer = msg1(
                    msg0(class(c"SFSpeechRecognizer"), sel(c"alloc")),
                    sel(c"initWithLocale:"),
                    locale,
                );
                if recognizer.is_null() {
                    VOICE_STATE.lock().unwrap().take();
                    let _ = app.emit("voice-transcript", serde_json::json!({"error": "recognizer-unavailable"}));
                    return;
                }

                let url = nsurl_file(&audio_path);
                let req_cls = class(c"SFSpeechURLRecognitionRequest");
                let request = msg1(msg0(req_cls, sel(c"alloc")), sel(c"initWithURL:"), url);
                if request.is_null() {
                    VOICE_STATE.lock().unwrap().take();
                    let _ = app.emit("voice-transcript", serde_json::json!({"error": "request-init-failed"}));
                    return;
                }

                msg_bool_set(request, sel(c"setShouldReportPartialResults:"), false);

                let block = Box::new(ResultBlock {
                    isa: &_NSConcreteStackBlock as *const _ as *const c_void,
                    flags: 0,
                    reserved: 0,
                    invoke: result_invoke,
                    descriptor: &RESULT_BLOCK_DESC,
                });
                let block_ptr = Box::into_raw(block);

                let f: unsafe extern "C" fn(*mut c_void, *const c_void, *mut c_void, *mut ResultBlock) -> *mut c_void =
                    std::mem::transmute(objc_msgSend as *const ());
                let _task = f(recognizer, sel(c"recognitionTaskWithRequest:resultHandler:"), request, block_ptr);

                // ObjC retains the block; let it own the memory
                std::mem::forget(Box::from_raw(block_ptr));
            }
        });
    }

    pub fn stop() {
        stop_and_transcribe();
    }
}

// ── Public commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn start_voice_listening(app: tauri::AppHandle) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        match macos_impl::start(app) {
            Ok(()) => None,
            Err(e) => Some(e),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Some("not-available".into())
    }
}

#[tauri::command]
pub fn stop_voice_listening() {
    #[cfg(target_os = "macos")]
    macos_impl::stop();
}
