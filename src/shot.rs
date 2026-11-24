//! `--screenshot <file.png>`: saves a picture of the window, used by automatic checks.

use std::path::Path;

#[cfg(windows)]
pub fn capture(hwnd: isize, out: &Path) -> Result<(), String> {
    use windows_sys::Win32::Foundation::{HWND, RECT};
    use windows_sys::Win32::Graphics::Gdi::*;
    use windows_sys::Win32::Storage::Xps::PrintWindow;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetClientRect;

    unsafe {
        let hwnd = hwnd as HWND;
        let mut rect: RECT = std::mem::zeroed();
        GetClientRect(hwnd, &mut rect);
        let (w, h) = (rect.right - rect.left, rect.bottom - rect.top);
        if w <= 0 || h <= 0 {
            return Err("window has no size".into());
        }
        let screen = GetDC(std::ptr::null_mut());
        let dc = CreateCompatibleDC(screen);
        let bmp = CreateCompatibleBitmap(screen, w, h);
        let old = SelectObject(dc, bmp as _);
        // 2 = PW_RENDERFULLCONTENT: also draws the web view when the window is covered.
        let ok = PrintWindow(hwnd, dc, 1 | 2);
        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        info.bmiHeader.biWidth = w;
        info.bmiHeader.biHeight = -h;
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB as u32;
        let mut pixels = vec![0u8; (w * h * 4) as usize];
        GetDIBits(dc, bmp, 0, h as u32, pixels.as_mut_ptr() as _, &mut info, DIB_RGB_COLORS);
        SelectObject(dc, old);
        DeleteObject(bmp as _);
        DeleteDC(dc);
        ReleaseDC(std::ptr::null_mut(), screen);
        if ok == 0 {
            return Err("PrintWindow failed".into());
        }
        for px in pixels.chunks_exact_mut(4) {
            px.swap(0, 2);
            px[3] = 255;
        }
        save_png(out, w as u32, h as u32, &pixels)
    }
}

#[cfg(not(windows))]
pub fn capture(_hwnd: isize, _out: &Path) -> Result<(), String> {
    Err("screenshots are only supported on Windows in this build".into())
}

pub fn save_png(out: &Path, w: u32, h: u32, rgba: &[u8]) -> Result<(), String> {
    if let Some(dir) = out.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let file = std::fs::File::create(out).map_err(|e| e.to_string())?;
    let mut enc = png::Encoder::new(std::io::BufWriter::new(file), w, h);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let mut writer = enc.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(rgba).map_err(|e| e.to_string())
}
