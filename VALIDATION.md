# Validation — 2026-11-20

The workspace already contained the Rust/Tauri desktop and Flutter mobile implementations when this review began. No new feature implementation is claimed by this review.

Craft Anything rebuild_check reported a successful desktop build and a valid 1280 × 800 application screenshot. The screenshot was opened and visually inspected. It shows the top tabs, left navigation, host search and host cards.

The mechanics sheet parses: 35 values, 33 sourced and 2 estimated. The checker explicitly cannot establish runtime equivalence to these values. Full visual equivalence is also unverified: no running-original screenshot was available in capture/ or reference/.

A direct cargo build could not open target/debug/.cargo-build-lock (access denied). The additional build/test command through Craft Anything was rejected because approval is required but the session approval policy is never. This does not invalidate the independent successful build reported by rebuild_check, but the Rust test suite was not rerun successfully in this review.

Flutter analysis/test execution did not return a result during this review. An existing Android release APK is present; its presence alone does not establish that the current source was successfully rebuilt or tested. iOS packaging has not been verified on this Windows host.

The native installer entry at 0x40338f was decompiled through Ghidra (evidence ev_dab32679759b6de9e6325ab2a20cae06849bb5bf36fa7878e680edb541d1c19a). It performs installer setup, argument parsing and temporary-directory handling; it does not establish SSH or UI behavior. Application rules are instead documented against the extracted Electron JavaScript in MECHANICS.md. The bounded JavaScript map in ev_1cfccd58f7885c83ac8590574138aea41886c793d755581cd83c1ec04da1a064 was partial and must not be treated as a complete feature inventory.

Known differences include neutral branding and a phone-adapted navigation drawer. Workspace saving, broadcast and workspace view shortcuts are documented as not built in MECHANICS.md. They must not be represented as implemented.

## Mobile palette correction � 2026-11-20
Updated Flutter to the reference light palette: grey background, white cards, dark text and a dark app bar with white controls. Drawer icons now use dark ink for contrast. rebuild_check passed desktop build and screenshot (~91% likeness); the fresh screenshot was visually compared with reference/picture-1.png. Flutter analyze and release APK build were attempted, but returned no output or completion; the existing APK predates this change. Current mobile packaging and on-device appearance remain unverified.

## Android test package handoff
Copied the existing 17:29 release APK to app/downloads/Shellbox-teste.apk (SHA256 4CFF4BD1863D52A3B7C08EAC0A3E998F23E77A50D5AAAA531751C6AD458B03F5). It predates the mobile palette correction; README explicitly states this. The new Flutter build produced no output and was stopped; Craft Anything build_command_run was rejected because approval is required and policy is never. No updated Android build or device test is claimed. rebuild_check passed the desktop build and screenshot with about 91% likeness. Opened the resulting round-4 screenshot and compared it with reference/picture-1.png: light surfaces, dark tabs and left navigation are preserved; host count, icons and toolbar spacing differ. Mechanics runtime equivalence remains unverified.
