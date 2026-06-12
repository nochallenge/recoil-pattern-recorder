// src-tauri/src/device.rs
//
// Optional companion-device integration over USB serial. Self-contained
// and NOT wired into the UI by default: set DEVICE_VID / DEVICE_PID below
// to your firmware's USB identifiers, then call into this module to push
// recorded patterns to a device.

#![allow(dead_code)]

use crate::pattern::Pattern;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serialport::{SerialPort, SerialPortType};
use std::io::{BufRead, BufReader, Write};
use std::time::Duration;

// Device identity — FILL THIS IN. Discovery matches a USB-serial port by
// USB Vendor/Product ID. Set these to whatever your firmware advertises;
// they ship blank (0x0000) so no device-specific IDs are baked into the
// repo.
pub const DEVICE_VID: u16 = 0x0000;
pub const DEVICE_PID: u16 = 0x0000;

#[derive(Serialize)]
#[serde(tag = "cmd")]
enum DeviceCommand<'a> {
    #[serde(rename = "upload")]
    Upload { slot: u8, pattern: &'a Pattern },
    #[serde(rename = "list")]
    List,
    #[serde(rename = "activate")]
    Activate { slot: u8 },
    #[serde(rename = "ping")]
    Ping,
}

#[derive(Deserialize, Debug)]
struct DeviceResponse {
    ok: Option<bool>,
    err: Option<String>,
}

pub fn find_device() -> Option<String> {
    let ports = serialport::available_ports().ok()?;
    for p in ports {
        if let SerialPortType::UsbPort(info) = &p.port_type {
            if info.vid == DEVICE_VID && info.pid == DEVICE_PID {
                return Some(p.port_name);
            }
        }
    }
    None
}

pub struct Device {
    port: Box<dyn SerialPort>,
}

impl Device {
    pub fn open(port_name: &str) -> Result<Self> {
        let port = serialport::new(port_name, 115_200)
            .timeout(Duration::from_millis(2000))
            .open()?;
        Ok(Self { port })
    }

    pub fn upload_pattern(&mut self, slot: u8, pattern: &Pattern) -> Result<()> {
        let cmd = DeviceCommand::Upload { slot, pattern };
        let line = serde_json::to_string(&cmd)? + "\n";
        self.port.write_all(line.as_bytes())?;
        self.port.flush()?;

        let mut reader = BufReader::new(self.port.try_clone()?);
        let mut resp = String::new();
        reader.read_line(&mut resp)?;
        let parsed: DeviceResponse = serde_json::from_str(resp.trim())?;

        if parsed.ok == Some(true) {
            Ok(())
        } else {
            Err(anyhow!(parsed.err.unwrap_or_else(|| "unknown error".into())))
        }
    }

    pub fn activate(&mut self, slot: u8) -> Result<()> {
        let cmd = DeviceCommand::Activate { slot };
        let line = serde_json::to_string(&cmd)? + "\n";
        self.port.write_all(line.as_bytes())?;
        self.port.flush()?;
        Ok(())
    }

    pub fn ping(&mut self) -> Result<()> {
        let cmd = DeviceCommand::Ping;
        let line = serde_json::to_string(&cmd)? + "\n";
        self.port.write_all(line.as_bytes())?;
        self.port.flush()?;
        Ok(())
    }
}
