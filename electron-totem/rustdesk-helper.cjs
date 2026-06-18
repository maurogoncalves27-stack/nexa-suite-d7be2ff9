const fs = require("fs");
const path = require("path");
const os = require("os");

const CONFIG_PATH = path.join(process.env.ProgramData || "C:\\ProgramData", "ViteSuite", "remote-access.json");

function readRemoteConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

function getRustDeskInfo() {
  const cfg = readRemoteConfig();
  const programExe = path.join(process.env.ProgramFiles || "C:\\Program Files", "RustDesk", "rustdesk.exe");
  let id = cfg?.rustdesk_id || null;
  if (!id && fs.existsSync(programExe)) {
    try {
      const { execSync } = require("child_process");
      id = execSync(`"${programExe}" --get-id`, { encoding: "utf8", timeout: 8000 }).trim();
    } catch {
      /* ignore */
    }
  }
  return {
    id: id || null,
    configPath: CONFIG_PATH,
    hostname: cfg?.hostname || os.hostname(),
    installed: fs.existsSync(programExe),
  };
}

module.exports = { getRustDeskInfo, CONFIG_PATH };
