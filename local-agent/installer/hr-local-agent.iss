[Setup]
AppId={{2B265018-EE67-4E4D-BF3F-4FA4322CE0AE}
AppName=HR Local Agent
AppVersion=1.0.0
AppPublisher=HR Team
DefaultDirName={localappdata}\HRLocalAgent
DefaultGroupName=HR Local Agent
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=HR-Local-Agent-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
UninstallDisplayIcon={app}\hr-local-agent.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\dist\hr-local-agent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\.env.example"; DestDir: "{app}"; DestName: ".env.example"; Flags: ignoreversion
Source: "..\scripts\register-installed-agent-task.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\register-installed-agent-task.ps1"" -InstallDir ""{app}"" -TaskName ""HRLocalAgent"" -StartNow"; Flags: runhidden waituntilterminated

[UninstallRun]
Filename: "schtasks.exe"; Parameters: "/Delete /TN ""HRLocalAgent"" /F"; Flags: runhidden; RunOnceId: "DeleteHRLocalAgentTask"
