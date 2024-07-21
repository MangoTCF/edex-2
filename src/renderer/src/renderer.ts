import { nanoid } from "nanoid"
import { ipcRenderer as ipc, webFrame } from "electron";
import * as remote from "@electron/remote";
import * as path from "path";
import { readFileSync, existsSync, writeFileSync, readdirSync, writeFile as fs_writeFile, PathOrFileDescriptor } from "fs";

var theme: { r: any; g: any; b: any; },
  term: any[],
  keyboard: { linkedToTerm: any; detach: () => void; attach: () => void; togglePasswordMode: () => void; },
  mods: { clock?: any; sysinfo?: any; hardwareInspector?: any; cpuinfo?: any; ramwatcher?: any; toplist?: any; netstat?: any; globe?: any; conninfo?: any; },
  currentTerm: number,
  term: any[],
  fsDisp: { followTab: () => void; toggleListview: () => void; toggleHidedotfiles: () => void; },
  activeFuzzyFinder: any;

// Disable eval()
window.eval = global.eval = function () {
  throw new Error("eval() is disabled for security reasons.");
};

// Security helper :)
function escapeHtml(text: string): string {
  let map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => { return map[m]; });
};

function encodePathURI(uri: string): string {
  return encodeURI(uri).replace(/#/g, "%23");
};

function purifyCSS(str: string | any): string {
  if (typeof str === "undefined") return "";
  if (typeof str !== "string") {
    str = str.toString();
  }
  return str.replace(/[<]/g, "");
};

function delay(ms: number): Promise<any> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

// Initiate basic error handling
window.onerror = (msg, path, line, col, error) => {
  document.getElementById("boot_screen").innerHTML += `${error} :  ${msg}<br/>==> at ${path}  ${line}:${col}`;
};


const settingsDir = remote.app.getPath("userData");
const themesDir = path.join(settingsDir, "themes");
const keyboardsDir = path.join(settingsDir, "keyboards");
const fontsDir = path.join(settingsDir, "fonts");
const settingsFile = path.join(settingsDir, "settings.json");
const shortcutsFile = path.join(settingsDir, "shortcuts.json");
const lastWindowStateFile = path.join(settingsDir, "lastWindowState.json");

// Load config
var settings = require(settingsFile);
var shortcuts = require(shortcutsFile);
var lastWindowState = require(lastWindowStateFile);

// Load CLI parameters
if (remote.process.argv.includes("--nointro")) {
  settings.nointroOverride = true;
} else {
  settings.nointroOverride = false;
}
if (remote.process.argv.includes("--nocursor")) {
  settings.nocursorOverride = true;
} else {
  settings.nocursorOverride = false;
}

// Retrieve theme override (hotswitch)
ipc.once("getThemeOverride", (e, theme) => {
  if (theme !== null) {
    settings.theme = theme;
    settings.nointroOverride = true;
    loadTheme(require(path.join(themesDir, settings.theme + ".json")));
  } else {
    loadTheme(require(path.join(themesDir, settings.theme + ".json")));
  }
});
ipc.send("getThemeOverride");
// Same for keyboard override/hotswitch
ipc.once("getKbOverride", (e, layout) => {
  if (layout !== null) {
    settings.keyboard = layout;
    settings.nointroOverride = true;
  }
});
ipc.send("getKbOverride");

// Load UI theme
function loadTheme(theme: { cssvars: { font_main: string; font_main_light: string; }; terminal: { fontFamily: string; }; colors: { r: any; g: any; b: any; black: any; light_black: any; grey: any; red: any; yellow: any; }; injectCSS: any; r: any; g: any; b: any; }) {

  if (document.querySelector("style.theming")) {
    document.querySelector("style.theming").remove();
  }

  // Load fonts
  let mainFont = new FontFace(theme.cssvars.font_main, `url("${path.join(fontsDir, theme.cssvars.font_main.toLowerCase().replace(/ /g, '_') + '.woff2').replace(/\\/g, '/')}")`);
  let lightFont = new FontFace(theme.cssvars.font_main_light, `url("${path.join(fontsDir, theme.cssvars.font_main_light.toLowerCase().replace(/ /g, '_') + '.woff2').replace(/\\/g, '/')}")`);
  let termFont = new FontFace(theme.terminal.fontFamily, `url("${path.join(fontsDir, theme.terminal.fontFamily.toLowerCase().replace(/ /g, '_') + '.woff2').replace(/\\/g, '/')}")`);

  document.fonts.add(mainFont);
  document.fonts.load("12px " + theme.cssvars.font_main);
  document.fonts.add(lightFont);
  document.fonts.load("12px " + theme.cssvars.font_main_light);
  document.fonts.add(termFont);
  document.fonts.load("12px " + theme.terminal.fontFamily);

  document.querySelector("head").innerHTML += `<style class="theming">
    :root {
        --font_main: "${purifyCSS(theme.cssvars.font_main)}";
        --font_main_light: "${purifyCSS(theme.cssvars.font_main_light)}";
        --font_mono: "${purifyCSS(theme.terminal.fontFamily)}";
        --color_r: ${purifyCSS(theme.colors.r)};
        --color_g: ${purifyCSS(theme.colors.g)};
        --color_b: ${purifyCSS(theme.colors.b)};
        --color_black: ${purifyCSS(theme.colors.black)};
        --color_light_black: ${purifyCSS(theme.colors.light_black)};
        --color_grey: ${purifyCSS(theme.colors.grey)};

        /* Used for error and warning modals */
        --color_red: ${purifyCSS(theme.colors.red) || "red"};
        --color_yellow: ${purifyCSS(theme.colors.yellow) || "yellow"};
    }

    body {
        font-family: var(--font_main), sans-serif;
        cursor: ${(settings.nocursorOverride || settings.nocursor) ? "none" : "default"} !important;
    }

    * {
   	   ${(settings.nocursorOverride || settings.nocursor) ? "cursor: none !important;" : ""}
	}

    ${purifyCSS(theme.injectCSS || "")}
    </style>`;

  theme.r = theme.colors.r;
  theme.g = theme.colors.g;
  theme.b = theme.colors.b;
};

function initGraphicalErrorHandling() {
  var edexErrorsModals = [];
  window.onerror = (msg, path, line, col, error) => {
    let errorModal = new Modal({
      type: "error",
      title: error,
      message: `${msg}<br/>        at ${path}  ${line}:${col}`
    });
    edexErrorsModals.push(errorModal);

    ipc.send("log", "error", `${error}: ${msg}`);
    ipc.send("log", "debug", `at ${path} ${line}:${col}`);
  };
}

function waitForFonts() {
  return new Promise<void>(resolve => {
    if (document.readyState !== "complete" || document.fonts.status !== "loaded") {
      document.addEventListener("readystatechange", () => {
        if (document.readyState === "complete") {
          if (document.fonts.status === "loaded") {
            resolve();
          } else {
            document.fonts.onloadingdone = () => {
              if (document.fonts.status === "loaded") resolve();
            };
          }
        }
      });
    } else {
      resolve();
    }
  });
}

// A proxy function used to add multithreading to systeminformation calls - see backend process manager @ _multithread.js
function initSystemInformationProxy() {

  var si = new Proxy({}, {
    apply: () => { throw new Error("Cannot use sysinfo proxy directly as a function") },
    set: () => { throw new Error("Cannot set a property on the sysinfo proxy") },
    get: (target, prop, receiver) => {
      return function (...args: string | any[]) {
        let callback = (typeof args[args.length - 1] === "function") ? true : false;

        return new Promise((resolve, reject) => {
          let id = nanoid();
          ipc.once("systeminformation-reply-" + id, (e, res) => {
            if (callback) {
              args[args.length - 1](res);
            }
            resolve(res);
          });
          ipc.send("systeminformation-call", prop, id, ...args);
        });
      };
    }
  });
}

// Init audio
var audioManager = new AudioManager();

// See #223
remote.app.focus();

let i = 0;
if (settings.nointro || settings.nointroOverride) {
  initGraphicalErrorHandling();
  initSystemInformationProxy();
  document.getElementById("boot_screen").remove();
  document.body.setAttribute("class", "");
  waitForFonts().then(initUI);
} else {
  displayLine();
}

// Startup boot log
function displayLine() {
  let bootScreen = document.getElementById("boot_screen");
  let log = readFileSync(path.join(__dirname, "assets", "misc", "boot_log.txt")).toString().split('\n');

  function isArchUser() {
    return require("os").platform() === "linux"
      && existsSync("/etc/os-release")
      && readFileSync("/etc/os-release").toString().includes("arch");
  }

  if (typeof log[i] === "undefined") {
    setTimeout(displayTitleScreen, 300);
    return;
  }

  if (log[i] === "Boot Complete") {
    audioManager.granted.play();
  } else {
    audioManager.stdout.play();
  }
  bootScreen.innerHTML += log[i] + "<br/>";
  i++;

  switch (true) {
    case i === 2:
      bootScreen.innerHTML += `eDEX-UI Kernel version ${remote.app.getVersion()} boot at ${Date().toString()}; root:xnu-1699.22.73~1/RELEASE_X86_64`;
    case i === 4:
      setTimeout(displayLine, 500);
      break;
    case i > 4 && i < 25:
      setTimeout(displayLine, 30);
      break;
    case i === 25:
      setTimeout(displayLine, 400);
      break;
    case i === 42:
      setTimeout(displayLine, 300);
      break;
    case i > 42 && i < 82:
      setTimeout(displayLine, 25);
      break;
    case i === 83:
      if (isArchUser())
        bootScreen.innerHTML += "btw i use arch<br/>";
      setTimeout(displayLine, 25);
      break;
    case i >= log.length - 2 && i < log.length:
      setTimeout(displayLine, 300);
      break;
    default:
      setTimeout(displayLine, Math.pow(1 - (i / 1000), 3) * 25);
  }
}

// Show "logo" and background grid
async function displayTitleScreen() {
  let bootScreen = document.getElementById("boot_screen");
  if (bootScreen === null) {
    bootScreen = document.createElement("section");
    bootScreen.setAttribute("id", "boot_screen");
    bootScreen.setAttribute("style", "z-index: 9999999");
    document.body.appendChild(bootScreen);
  }
  bootScreen.innerHTML = "";
  audioManager.theme.play();

  await delay(400);

  document.body.setAttribute("class", "");
  bootScreen.setAttribute("class", "center");
  bootScreen.innerHTML = "<h1>eDEX-UI</h1>";
  let title = document.querySelector("section > h1");

  await delay(200);

  document.body.setAttribute("class", "solidBackground");

  await delay(100);

  title.setAttribute("style", `background-color: rgb(${theme.r}, ${theme.g}, ${theme.b});border-bottom: 5px solid rgb(${theme.r}, ${theme.g}, ${theme.b});`);

  await delay(300);

  title.setAttribute("style", `border: 5px solid rgb(${theme.r}, ${theme.g}, ${theme.b});`);

  await delay(100);

  title.setAttribute("style", "");
  title.setAttribute("class", "glitch");

  await delay(500);

  document.body.setAttribute("class", "");
  title.setAttribute("class", "");
  title.setAttribute("style", `border: 5px solid rgb(${theme.r}, ${theme.g}, ${theme.b});`);

  await delay(1000);
  if (term) {
    bootScreen.remove();
    return true;
  }
  initGraphicalErrorHandling();
  initSystemInformationProxy();
  waitForFonts().then(() => {
    bootScreen.remove();
    initUI();
  });
}

// Returns the user's desired display name
async function getDisplayName() {
  let user = settings.username || null;
  if (user)
    return user;

  try {
    user = await require("username")();
  } catch (e) { }

  return user;
}

// Create the UI's html structure and initialize the terminal client and the keyboard
async function initUI() {
  document.body.innerHTML += `<section class="mod_column" id="mod_column_left">
        <h3 class="title"><p>PANEL</p><p>SYSTEM</p></h3>
    </section>
    <section id="main_shell" style="height:0%;width:0%;opacity:0;margin-bottom:30vh;" augmented-ui="bl-clip tr-clip exe">
        <h3 class="title" style="opacity:0;"><p>TERMINAL</p><p>MAIN SHELL</p></h3>
        <h1 id="main_shell_greeting"></h1>
    </section>
    <section class="mod_column" id="mod_column_right">
        <h3 class="title"><p>PANEL</p><p>NETWORK</p></h3>
    </section>`;

  await delay(10);

  audioManager.expand.play();
  document.getElementById("main_shell").setAttribute("style", "height:0%;margin-bottom:30vh;");

  await delay(500);

  document.getElementById("main_shell").setAttribute("style", "margin-bottom: 30vh;");
  document.querySelector("#main_shell > h3.title").setAttribute("style", "");

  await delay(700);

  document.getElementById("main_shell").setAttribute("style", "opacity: 0;");
  document.body.innerHTML += `
    <section id="filesystem" style="width: 0px;" class="${settings.hideDotfiles ? "hideDotfiles" : ""} ${settings.fsListView ? "list-view" : ""}">
    </section>
    <section id="keyboard" style="opacity:0;">
    </section>`;
  keyboard = new Keyboard({
    layout: path.join(keyboardsDir, settings.keyboard + ".json"),
    container: "keyboard"
  });

  await delay(10);

  document.getElementById("main_shell").setAttribute("style", "");

  await delay(270);

  let greeter = document.getElementById("main_shell_greeting");

  getDisplayName().then(user => {
    if (user) {
      greeter.innerHTML += `Welcome back, <em>${user}</em>`;
    } else {
      greeter.innerHTML += "Welcome back";
    }
  });

  greeter.setAttribute("style", "opacity: 1;");

  document.getElementById("filesystem").setAttribute("style", "");
  document.getElementById("keyboard").setAttribute("style", "");
  document.getElementById("keyboard").setAttribute("class", "animation_state_1");
  audioManager.keyboard.play();

  await delay(100);

  document.getElementById("keyboard").setAttribute("class", "animation_state_1 animation_state_2");

  await delay(1000);

  greeter.setAttribute("style", "opacity: 0;");

  await delay(100);

  document.getElementById("keyboard").setAttribute("class", "");

  await delay(400);

  greeter.remove();

  // Initialize modules
  mods = {};

  // Left column
  mods.clock = new Clock("mod_column_left");
  mods.sysinfo = new Sysinfo("mod_column_left");
  mods.hardwareInspector = new HardwareInspector("mod_column_left");
  mods.cpuinfo = new Cpuinfo("mod_column_left");
  mods.ramwatcher = new RAMwatcher("mod_column_left");
  mods.toplist = new Toplist("mod_column_left");

  // Right column
  mods.netstat = new Netstat("mod_column_right");
  mods.globe = new LocationGlobe("mod_column_right");
  mods.conninfo = new Conninfo("mod_column_right");

  // Fade-in animations
  document.querySelectorAll(".mod_column").forEach(e => {
    e.setAttribute("class", "mod_column activated");
  });
  let i = 0;
  let left = document.querySelectorAll("#mod_column_left > div");
  let right = document.querySelectorAll("#mod_column_right > div");
  let x = setInterval(() => {
    if (!left[i] && !right[i]) {
      clearInterval(x);
    } else {
      audioManager.panels.play();
      if (left[i]) {
        left[i].setAttribute("style", "animation-play-state: running;");
      }
      if (right[i]) {
        right[i].setAttribute("style", "animation-play-state: running;");
      }
      i++;
    }
  }, 500);

  await delay(100);

  // Initialize the terminal
  let shellContainer = document.getElementById("main_shell");
  shellContainer.innerHTML += `
        <ul id="main_shell_tabs">
            <li id="shell_tab0" onclick="window.focusShellTab(0);" class="active"><p>MAIN SHELL</p></li>
            <li id="shell_tab1" onclick="window.focusShellTab(1);"><p>EMPTY</p></li>
            <li id="shell_tab2" onclick="window.focusShellTab(2);"><p>EMPTY</p></li>
            <li id="shell_tab3" onclick="window.focusShellTab(3);"><p>EMPTY</p></li>
            <li id="shell_tab4" onclick="window.focusShellTab(4);"><p>EMPTY</p></li>
        </ul>
        <div id="main_shell_innercontainer">
            <pre id="terminal0" class="active"></pre>
            <pre id="terminal1"></pre>
            <pre id="terminal2"></pre>
            <pre id="terminal3"></pre>
            <pre id="terminal4"></pre>
        </div>`;
  term = {
    0: new Terminal({
      role: "client",
      parentId: "terminal0",
      port: settings.port || 3000
    })
  };
  currentTerm = 0;
  term[0].onprocesschange = (p: any) => {
    document.getElementById("shell_tab0").innerHTML = `<p>MAIN - ${p}</p>`;
  };
  // Prevent losing hardware keyboard focus on the terminal when using touch keyboard
  window.onmouseup = (e: any) => {
    if (keyboard.linkedToTerm) term[currentTerm].term.focus();
  };
  term[0].term.writeln("\033[1m" + `Welcome to eDEX-UI v${remote.app.getVersion()} - Electron v${process.versions.electron}` +"\033[0m");

  await delay(100);

  fsDisp = new FilesystemDisplay({
    parentId: "filesystem"
  });

  await delay(200);

  document.getElementById("filesystem").setAttribute("style", "opacity: 1;");

  // Resend terminal CWD to fsDisp if we're hot reloading
  if (window.performance.navigation.type === 1) { //TODO: find an alternative to this shit
    term[currentTerm].resendCWD();
  }

  await delay(200);

  updateCheck = new UpdateChecker();
}

function themeChanger(theme: any) {
  ipc.send("setThemeOverride", theme);
  setTimeout(() => {
    window.location.reload();
  }, 100);
};

function remakeKeyboard(layout: string) {
  document.getElementById("keyboard").innerHTML = "";
  keyboard = new Keyboard({
    layout: path.join(keyboardsDir, layout + ".json" || settings.keyboard + ".json"),
    container: "keyboard"
  });
  ipc.send("setKbOverride", layout);
};

function focusShellTab(number: string | number) {
  audioManager.folder.play();

  if (number !== currentTerm && term[number]) {
    currentTerm = number;

    document.querySelectorAll(`ul#main_shell_tabs > li:not(:nth-child(${number + 1}))`).forEach(e => {
      e.setAttribute("class", "");
    });
    document.getElementById("shell_tab" + number).setAttribute("class", "active");

    document.querySelectorAll(`div#main_shell_innercontainer > pre:not(:nth-child(${number + 1}))`).forEach(e => {
      e.setAttribute("class", "");
    });
    document.getElementById("terminal" + number).setAttribute("class", "active");

    term[number].fit();
    term[number].term.focus();
    term[number].resendCWD();

    fsDisp.followTab();
  } else if (number > 0 && number <= 4 && term[number] !== null && typeof term[number] !== "object") {
    term[number] = null;

    document.getElementById("shell_tab" + number).innerHTML = "<p>LOADING...</p>";
    ipc.send("ttyspawn", "true");
    ipc.once("ttyspawn-reply", (e, r) => {
      if (r.startsWith("ERROR")) {
        document.getElementById("shell_tab" + number).innerHTML = "<p>ERROR</p>";
      } else if (r.startsWith("SUCCESS")) {
        let port = Number(r.substr(9));

        term[number] = new Terminal({
          role: "client",
          parentId: "terminal" + number,
          port
        });

        term[number].onclose = (e: any) => {
          delete term[number].onprocesschange;
          document.getElementById("shell_tab" + number).innerHTML = "<p>EMPTY</p>";
          document.getElementById("terminal" + number).innerHTML = "";
          term[number].term.dispose();
          delete term[number];
          useAppShortcut("PREVIOUS_TAB");
        };

        term[number].onprocesschange = (p: any) => {
          document.getElementById("shell_tab" + number).innerHTML = `<p>#${number + 1} - ${p}</p>`;
        };

        document.getElementById("shell_tab" + number).innerHTML = `<p>::${port}</p>`;
        setTimeout(() => {
          focusShellTab(number);
        }, 500);
      }
    });
  }
};

// Settings editor
async function openSettings() {
  if (document.getElementById("settingsEditor")) return;

  // Build lists of available keyboards, themes, monitors
  let keyboards: string, themes: string, monitors: string, ifaces: string;
  readdirSync(keyboardsDir).forEach(kb => {
    if (!kb.endsWith(".json")) return;
    kb = kb.replace(".json", "");
    if (kb === settings.keyboard) return;
    keyboards += `<option>${kb}</option>`;
  });
  readdirSync(themesDir).forEach(th => {
    if (!th.endsWith(".json")) return;
    th = th.replace(".json", "");
    if (th === settings.theme) return;
    themes += `<option>${th}</option>`;
  });
  for (let i = 0; i < remote.screen.getAllDisplays().length; i++) {
    if (i !== settings.monitor) monitors += `<option>${i}</option>`;
  }
  let nets = await si.networkInterfaces();
  nets.forEach((net: { iface: any; }) => {
    if (net.iface !== mods.netstat.iface) ifaces += `<option>${net.iface}</option>`;
  });

  // Unlink the tactile keyboard from the terminal emulator to allow filling in the settings fields
  keyboard.detach();

  new Modal({
    type: "custom",
    title: `Settings <i>(v${remote.app.getVersion()})</i>`,
    html: `<table id="settingsEditor">
                    <tr>
                        <th>Key</th>
                        <th>Description</th>
                        <th>Value</th>
                    </tr>
                    <tr>
                        <td>shell</td>
                        <td>The program to run as a terminal emulator</td>
                        <td><input type="text" id="settingsEditor-shell" value="${settings.shell}"></td>
                    </tr>
                    <tr>
                        <td>shellArgs</td>
                        <td>Arguments to pass to the shell</td>
                        <td><input type="text" id="settingsEditor-shellArgs" value="${settings.shellArgs || ''}"></td>
                    </tr>
                    <tr>
                        <td>cwd</td>
                        <td>Working Directory to start in</td>
                        <td><input type="text" id="settingsEditor-cwd" value="${settings.cwd}"></td>
                    </tr>
                    <tr>
                        <td>env</td>
                        <td>Custom shell environment override</td>
                        <td><input type="text" id="settingsEditor-env" value="${settings.env}"></td>
                    </tr>
                    <tr>
                        <td>username</td>
                        <td>Custom username to display at boot</td>
                        <td><input type="text" id="settingsEditor-username" value="${settings.username}"></td>
                    </tr>
                    <tr>
                        <td>keyboard</td>
                        <td>On-screen keyboard layout code</td>
                        <td><select id="settingsEditor-keyboard">
                            <option>${settings.keyboard}</option>
                            ${keyboards}
                        </select></td>
                    </tr>
                    <tr>
                        <td>theme</td>
                        <td>Name of the theme to load</td>
                        <td><select id="settingsEditor-theme">
                            <option>${settings.theme}</option>
                            ${themes}
                        </select></td>
                    </tr>
                    <tr>
                        <td>termFontSize</td>
                        <td>Size of the terminal text in pixels</td>
                        <td><input type="number" id="settingsEditor-termFontSize" value="${settings.termFontSize}"></td>
                    </tr>
                    <tr>
                        <td>audio</td>
                        <td>Activate audio sound effects</td>
                        <td><select id="settingsEditor-audio">
                            <option>${settings.audio}</option>
                            <option>${!settings.audio}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>audioVolume</td>
                        <td>Set default volume for sound effects (0.0 - 1.0)</td>
                        <td><input type="number" id="settingsEditor-audioVolume" value="${settings.audioVolume || '1.0'}"></td>
                    </tr>
                    <tr>
                        <td>disableFeedbackAudio</td>
                        <td>Disable recurring feedback sound FX (input/output, mostly)</td>
                        <td><select id="settingsEditor-disableFeedbackAudio">
                            <option>${settings.disableFeedbackAudio}</option>
                            <option>${!settings.disableFeedbackAudio}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>port</td>
                        <td>Local port to use for UI-shell connection</td>
                        <td><input type="number" id="settingsEditor-port" value="${settings.port}"></td>
                    </tr>
                    <tr>
                        <td>pingAddr</td>
                        <td>IPv4 address to test Internet connectivity</td>
                        <td><input type="text" id="settingsEditor-pingAddr" value="${settings.pingAddr || "1.1.1.1"}"></td>
                    </tr>
                    <tr>
                        <td>clockHours</td>
                        <td>Clock format (12/24 hours)</td>
                        <td><select id="settingsEditor-clockHours">
                            <option>${(settings.clockHours === 12) ? "12" : "24"}</option>
                            <option>${(settings.clockHours === 12) ? "24" : "12"}</option>
                        </select></td>
                    <tr>
                        <td>monitor</td>
                        <td>Which monitor to spawn the UI in (defaults to primary display)</td>
                        <td><select id="settingsEditor-monitor">
                            ${(typeof settings.monitor !== "undefined") ? "<option>" + settings.monitor + "</option>" : ""}
                            ${monitors}
                        </select></td>
                    </tr>
                    <tr>
                        <td>nointro</td>
                        <td>Skip the intro boot log and logo${(settings.nointroOverride) ? " (Currently overridden by CLI flag)" : ""}</td>
                        <td><select id="settingsEditor-nointro">
                            <option>${settings.nointro}</option>
                            <option>${!settings.nointro}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>nocursor</td>
                        <td>Hide the mouse cursor${(settings.nocursorOverride) ? " (Currently overridden by CLI flag)" : ""}</td>
                        <td><select id="settingsEditor-nocursor">
                            <option>${settings.nocursor}</option>
                            <option>${!settings.nocursor}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>iface</td>
                        <td>Override the interface used for network monitoring</td>
                        <td><select id="settingsEditor-iface">
                            <option>${mods.netstat.iface}</option>
                            ${ifaces}
                        </select></td>
                    </tr>
                    <tr>
                        <td>allowWindowed</td>
                        <td>Allow using F11 key to set the UI in windowed mode</td>
                        <td><select id="settingsEditor-allowWindowed">
                            <option>${settings.allowWindowed}</option>
                            <option>${!settings.allowWindowed}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>keepGeometry</td>
                        <td>Try to keep a 16:9 aspect ratio in windowed mode</td>
                        <td><select id="settingsEditor-keepGeometry">
                            <option>${(settings.keepGeometry === false) ? 'false' : 'true'}</option>
                            <option>${(settings.keepGeometry === false) ? 'true' : 'false'}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>excludeThreadsFromToplist</td>
                        <td>Display threads in the top processes list</td>
                        <td><select id="settingsEditor-excludeThreadsFromToplist">
                            <option>${settings.excludeThreadsFromToplist}</option>
                            <option>${!settings.excludeThreadsFromToplist}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>hideDotfiles</td>
                        <td>Hide files and directories starting with a dot in file display</td>
                        <td><select id="settingsEditor-hideDotfiles">
                            <option>${settings.hideDotfiles}</option>
                            <option>${!settings.hideDotfiles}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>fsListView</td>
                        <td>Show files in a more detailed list instead of an icon grid</td>
                        <td><select id="settingsEditor-fsListView">
                            <option>${settings.fsListView}</option>
                            <option>${!settings.fsListView}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>experimentalGlobeFeatures</td>
                        <td>Toggle experimental features for the network globe</td>
                        <td><select id="settingsEditor-experimentalGlobeFeatures">
                            <option>${settings.experimentalGlobeFeatures}</option>
                            <option>${!settings.experimentalGlobeFeatures}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>experimentalFeatures</td>
                        <td>Toggle Chrome's experimental web features (DANGEROUS)</td>
                        <td><select id="settingsEditor-experimentalFeatures">
                            <option>${settings.experimentalFeatures}</option>
                            <option>${!settings.experimentalFeatures}</option>
                        </select></td>
                    </tr>
                </table>
                <h6 id="settingsEditorStatus">Loaded values from memory</h6>
                <br>`,
    buttons: [
      { label: "Open in External Editor", action: `electron.shell.openPath('${settingsFile}');electronWin.minimize();` },
      { label: "Save to Disk", action: "window.writeSettingsFile()" },
      { label: "Reload UI", action: "window.location.reload(true);" },
      { label: "Restart eDEX", action: "electron.remote.app.relaunch();electron.remote.app.quit();" }
    ]
  }, () => {
    // Link the keyboard back to the terminal
    keyboard.attach();

    // Focus back on the term
    term[currentTerm].term.focus();
  });
};

function _writeFile(path: PathOrFileDescriptor) {
  fs_writeFile(path, document.getElementById("fileEdit").textContent, "utf-8", () => {
    document.getElementById("fedit-status").innerHTML = "<i>File saved.</i>";
  });
};

function writeSettingsFile() {
  settings = {
    shell: document.getElementById("settingsEditor-shell").value,
    shellArgs: document.getElementById("settingsEditor-shellArgs").value,
    cwd: document.getElementById("settingsEditor-cwd").value,
    env: document.getElementById("settingsEditor-env").value,
    username: document.getElementById("settingsEditor-username").value,
    keyboard: document.getElementById("settingsEditor-keyboard").value,
    theme: document.getElementById("settingsEditor-theme").value,
    termFontSize: Number(document.getElementById("settingsEditor-termFontSize").value),
    audio: (document.getElementById("settingsEditor-audio").value === "true"),
    audioVolume: Number(document.getElementById("settingsEditor-audioVolume").value),
    disableFeedbackAudio: (document.getElementById("settingsEditor-disableFeedbackAudio").value === "true"),
    pingAddr: document.getElementById("settingsEditor-pingAddr").value,
    clockHours: Number(document.getElementById("settingsEditor-clockHours").value),
    port: Number(document.getElementById("settingsEditor-port").value),
    monitor: Number(document.getElementById("settingsEditor-monitor").value),
    nointro: (document.getElementById("settingsEditor-nointro").value === "true"),
    nocursor: (document.getElementById("settingsEditor-nocursor").value === "true"),
    iface: document.getElementById("settingsEditor-iface").value,
    allowWindowed: (document.getElementById("settingsEditor-allowWindowed").value === "true"),
    forceFullscreen: settings.forceFullscreen,
    keepGeometry: (document.getElementById("settingsEditor-keepGeometry").value === "true"),
    excludeThreadsFromToplist: (document.getElementById("settingsEditor-excludeThreadsFromToplist").value === "true"),
    hideDotfiles: (document.getElementById("settingsEditor-hideDotfiles").value === "true"),
    fsListView: (document.getElementById("settingsEditor-fsListView").value === "true"),
    experimentalGlobeFeatures: (document.getElementById("settingsEditor-experimentalGlobeFeatures").value === "true"),
    experimentalFeatures: (document.getElementById("settingsEditor-experimentalFeatures").value === "true")
  };

  Object.keys(settings).forEach(key => {
    if (settings[key] === "undefined") {
      delete settings[key];
    }
  });

  writeFileSync(settingsFile, JSON.stringify(settings));
  document.getElementById("settingsEditorStatus").innerText = "New values written to settings.json file at " + new Date().toTimeString();
};

function toggleFullScreen() {
  let useFullscreen = (electronWin.isFullScreen() ? false : true);
  electronWin.setFullScreen(useFullscreen);

  //Update settings
  lastWindowState["useFullscreen"] = useFullscreen;

  writeFileSync(lastWindowStateFile, JSON.stringify(lastWindowState));
};

// Display available keyboard shortcuts and custom shortcuts helper
function openShortcutsHelp() {
  if (document.getElementById("settingsEditor")) return;

  const shortcutsDefinition = {
    "COPY": "Copy selected buffer from the terminal.",
    "PASTE": "Paste system clipboard to the terminal.",
    "NEXT_TAB": "Switch to the next opened terminal tab (left to right order).",
    "PREVIOUS_TAB": "Switch to the previous opened terminal tab (right to left order).",
    "TAB_X": "Switch to terminal tab <strong>X</strong>, or create it if it hasn't been opened yet.",
    "SETTINGS": "Open the settings editor.",
    "SHORTCUTS": "List and edit available keyboard shortcuts.",
    "FUZZY_SEARCH": "Search for entries in the current working directory.",
    "FS_LIST_VIEW": "Toggle between list and grid view in the file browser.",
    "FS_DOTFILES": "Toggle hidden files and directories in the file browser.",
    "KB_PASSMODE": "Toggle the on-screen keyboard's \"Password Mode\", which allows you to safely<br>type sensitive information even if your screen might be recorded (disable visual input feedback).",
    "DEV_DEBUG": "Open Chromium Dev Tools, for debugging purposes.",
    "DEV_RELOAD": "Trigger front-end hot reload."
  };

  let appList = "";
  shortcuts.filter((e: { type: string; }) => e.type === "app").forEach((cut: { action: string; enabled: any; trigger: any; }) => {
    let action = (cut.action.startsWith("TAB_")) ? "TAB_X" : cut.action;

    appList += `<tr>
                        <td>${(cut.enabled) ? 'YES' : 'NO'}</td>
                        <td><input disabled type="text" maxlength=25 value="${cut.trigger}"></td>
                        <td>${shortcutsDefinition[action]}</td>
                    </tr>`;
  });

  let customList = "";
  shortcuts.filter((e: { type: string; }) => e.type === "shell").forEach((cut: { enabled: any; trigger: any; action: any; linebreak: any; }) => {
    customList += `<tr>
                            <td>${(cut.enabled) ? 'YES' : 'NO'}</td>
                            <td><input disabled type="text" maxlength=25 value="${cut.trigger}"></td>
                            <td>
                                <input disabled type="text" placeholder="Run terminal command..." value="${cut.action}">
                                <input disabled type="checkbox" name="shortcutsHelpNew_Enter" ${(cut.linebreak) ? 'checked' : ''}>
                                <label for="shortcutsHelpNew_Enter">Enter</label>
                            </td>
                        </tr>`;
  });

  keyboard.detach();
  new Modal({
    type: "custom",
    title: `Available Keyboard Shortcuts <i>(v${electron.remote.app.getVersion()})</i>`,
    html: `<h5>Using either the on-screen or a physical keyboard, you can use the following shortcuts:</h5>
                <details open id="shortcutsHelpAccordeon1">
                    <summary>Emulator shortcuts</summary>
                    <table class="shortcutsHelp">
                        <tr>
                            <th>Enabled</th>
                            <th>Trigger</th>
                            <th>Action</th>
                        </tr>
                        ${appList}
                    </table>
                </details>
                <br>
                <details id="shortcutsHelpAccordeon2">
                    <summary>Custom command shortcuts</summary>
                    <table class="shortcutsHelp">
                        <tr>
                            <th>Enabled</th>
                            <th>Trigger</th>
                            <th>Command</th>
                        <tr>
                       ${customList}
                    </table>
                </details>
                <br>`,
    buttons: [
      { label: "Open Shortcuts File", action: `electron.shell.openPath('${shortcutsFile}');electronWin.minimize();` },
      { label: "Reload UI", action: "window.location.reload(true);" },
    ]
  }, () => {
    keyboard.attach();
    term[currentTerm].term.focus();
  });

  let wrap1 = document.getElementById('shortcutsHelpAccordeon1');
  let wrap2 = document.getElementById('shortcutsHelpAccordeon2');

  wrap1.addEventListener('toggle', e => {
    wrap2.open = !wrap1.open;
  });

  wrap2.addEventListener('toggle', e => {
    wrap1.open = !wrap2.open;
  });
};

function useAppShortcut(action: string) {
  switch (action) {
    case "COPY":
      term[currentTerm].clipboard.copy();
      return true;
    case "PASTE":
      term[currentTerm].clipboard.paste();
      return true;
    case "NEXT_TAB":
      if (term[currentTerm + 1]) {
        focusShellTab(currentTerm + 1);
      } else if (term[currentTerm + 2]) {
        focusShellTab(currentTerm + 2);
      } else if (term[currentTerm + 3]) {
        focusShellTab(currentTerm + 3);
      } else if (term[currentTerm + 4]) {
        focusShellTab(currentTerm + 4);
      } else {
        focusShellTab(0);
      }
      return true;
    case "PREVIOUS_TAB":
      let i = currentTerm || 4;
      if (term[i] && i !== currentTerm) {
        focusShellTab(i);
      } else if (term[i - 1]) {
        focusShellTab(i - 1);
      } else if (term[i - 2]) {
        focusShellTab(i - 2);
      } else if (term[i - 3]) {
        focusShellTab(i - 3);
      } else if (term[i - 4]) {
        focusShellTab(i - 4);
      }
      return true;
    case "TAB_1":
      focusShellTab(0);
      return true;
    case "TAB_2":
      focusShellTab(1);
      return true;
    case "TAB_3":
      focusShellTab(2);
      return true;
    case "TAB_4":
      focusShellTab(3);
      return true;
    case "TAB_5":
      focusShellTab(4);
      return true;
    case "SETTINGS":
      openSettings();
      return true;
    case "SHORTCUTS":
      openShortcutsHelp();
      return true;
    case "FUZZY_SEARCH":
      activeFuzzyFinder = new FuzzyFinder();
      return true;
    case "FS_LIST_VIEW":
      fsDisp.toggleListview();
      return true;
    case "FS_DOTFILES":
      fsDisp.toggleHidedotfiles();
      return true;
    case "KB_PASSMODE":
      keyboard.togglePasswordMode();
      return true;
    case "DEV_DEBUG":
      remote.getCurrentWindow().webContents.toggleDevTools();
      return true;
    case "DEV_RELOAD":
      window.location.reload();
      return true;
    default:
      console.warn(`Unknown "${action}" app shortcut action`);
      return false;
  }
};

// Global keyboard shortcuts
const globalShortcut = remote.globalShortcut;
globalShortcut.unregisterAll();

function registerKeyboardShortcuts() {
  shortcuts.forEach((cut: { enabled: any; type: string; action: string; trigger: string; linebreak: any; }) => {
    if (!cut.enabled) return;

    if (cut.type === "app") {
      if (cut.action === "TAB_X") {
        for (let i = 1; i <= 5; i++) {
          let trigger = cut.trigger.replace("X", i);
          let dfn = () => { useAppShortcut(`TAB_${i}`) };
          globalShortcut.register(trigger, dfn);
        }
      } else {
        globalShortcut.register(cut.trigger, () => {
          useAppShortcut(cut.action);
        });
      }
    } else if (cut.type === "shell") {
      globalShortcut.register(cut.trigger, () => {
        let fn = (cut.linebreak) ? "writelr" : "write";
        term[currentTerm][fn](cut.action);
      });
    } else {
      console.warn(`${cut.trigger} has unknown type`);
    }
  });
};
registerKeyboardShortcuts();

// See #361
window.addEventListener("focus", () => {
  registerKeyboardShortcuts();
});

window.addEventListener("blur", () => {
  globalShortcut.unregisterAll();
});

// Prevent showing menu, exiting fullscreen or app with keyboard shortcuts
document.addEventListener("keydown", e => {
  if (e.key === "Alt") {
    e.preventDefault();
  }
  if (e.code.startsWith("Alt") && e.ctrlKey && e.shiftKey) {
    e.preventDefault();
  }
  if (e.key === "F11" && !settings.allowWindowed) {
    e.preventDefault();
  }
  if (e.code === "KeyD" && e.ctrlKey) {
    e.preventDefault();
  }
  if (e.code === "KeyA" && e.ctrlKey) {
    e.preventDefault();
  }
});

// Fix #265
window.addEventListener("keyup", e => {
  if (require("os").platform() === "win32" && e.key === "F4" && e.altKey === true) {
    remote.app.quit();
  }
});

// Fix double-tap zoom on touchscreens
webFrame.setVisualZoomLevelLimits(1, 1);

// Resize terminal with window
window.onresize = () => {
  if (typeof currentTerm !== "undefined") {
    if (typeof term[currentTerm] !== "undefined") {
      term[currentTerm].fit();
    }
  }
};

// See #413
resizeTimeout = null;
let electronWin = remote.getCurrentWindow();
electronWin.on("resize", () => {
  if (settings.keepGeometry === false) return;
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    let win = remote.getCurrentWindow();
    if (win.isFullScreen()) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      win.setFullScreen(true);
      return false;
    }

    let size = win.getSize();

    if (size[0] >= size[1]) {
      win.setSize(size[0], size[0] * 9 / 16);
    } else {
      win.setSize(size[1], size[1] * 9 / 16);
    }
  }, 100);
});

electronWin.on("leave-full-screen", () => {
  remote.getCurrentWindow().setSize(960, 540);
});
