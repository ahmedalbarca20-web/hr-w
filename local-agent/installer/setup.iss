; Inno Setup 6 — build a single installer for the attendance agent.
; Adjust AppSource below to the folder containing polling-agent.js, server.js, node_modules, etc.

#define MyAppName "Attendance Agent"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Your Company"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={commonpf}\AttendanceAgent
DefaultGroupName={#MyAppName}
OutputDir=.\dist
OutputBaseFilename=AttendanceAgent-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "service"; Description: "Install && start Windows service"; GroupDescription: "Service:"; Flags: checkedonce

[Files]
; TODO: point to your packaged tree (include node_modules or ship portable Node — adjust for production).
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "installer\*,.git\*,dist\*"

[Run]
Filename: "{cmd}"; Parameters: "/c npm install --omit=dev"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; Tasks: service
Filename: "{cmd}"; Parameters: "/c npm install node-windows && node install-windows-service.js"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; Tasks: service

[Code]
procedure InitializeWizard;
begin
  { Optional: collect API URL / agent_id / token into config.json via custom wizard pages. }
end;
