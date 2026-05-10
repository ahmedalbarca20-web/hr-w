; Inno Setup 6 — commercial installer (no Node.js on employee PC).
; Prerequisite: run  npm run build-agent  in ..\  so  ..\dist\AttendanceAgent.exe  exists.
; Compile: ISCC.exe setup.iss  (Inno Setup 6)
; Silent:   AttendanceAgentSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /APIBASE=https://host/api /ACTIVATION=OFFICE-ABCD-1234

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
OutputDir=dist
OutputBaseFilename=AttendanceAgentSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
DisableProgramGroupPage=yes
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\dist\AttendanceAgent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\scripts\install-service-sc.ps1"; DestDir: "{app}"; Flags: ignoreversion

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""try {{ Stop-Service -Name 'AttendanceAgent' -Force -ErrorAction SilentlyContinue }} catch {{}}; & sc.exe delete AttendanceAgent 2>$null"""; Flags: runhidden waituntilterminated

[Code]
var
  ConfigPage: TInputQueryWizardPage;

function ShellQuote(const S: String): String;
begin
  Result := '"' + StringChange(S, '"', '') + '"';
end;

function TrimUrl(const S: String): String;
var
  L: Integer;
begin
  Result := Trim(S);
  L := Length(Result);
  while (L > 0) and (Result[L] = '/') do
  begin
    Delete(Result, L, 1);
    L := Length(Result);
  end;
end;

function ExtractCmdValue(const Flag: String): String;
var
  I, P: Integer;
  S, Prefix: String;
begin
  Result := '';
  Prefix := '/' + Flag + '=';
  for I := 1 to ParamCount do
  begin
    S := ParamStr(I);
    if CompareText(Copy(S, 1, Length(Prefix)), Prefix) = 0 then
    begin
      Result := Copy(S, Length(Prefix) + 1, MaxInt);
      Exit;
    end;
  end;
end;

function GetApiBase: String;
begin
  Result := TrimUrl(ExtractCmdValue('APIBASE'));
  if Result <> '' then
    Exit;
  if ConfigPage <> nil then
    Result := TrimUrl(ConfigPage.Values[0]);
end;

function GetActivationCode: String;
begin
  Result := Trim(ExtractCmdValue('ACTIVATION'));
  if Result <> '' then
    Exit;
  if ConfigPage <> nil then
    Result := Trim(ConfigPage.Values[1]);
end;

procedure InitializeWizard;
begin
  ConfigPage := CreateInputQueryPage(wpWelcome,
    'Cloud connection',
    'Configuration',
    'Enter the values provided by your administrator. The agent only makes outbound HTTPS connections to your company API.');
  ConfigPage.Add('API base URL (example: https://your-company.example.com/api):', False);
  ConfigPage.Add('Activation code (example: OFFICE-ABCD-1234):', False);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if WizardSilent then
    Exit;
  if (ConfigPage <> nil) and (CurPageID = ConfigPage.ID) then
  begin
    if GetApiBase = '' then
    begin
      MsgBox('Please enter the API base URL (must include /api).', mbError, MB_OK);
      Result := False;
    end
    else if GetActivationCode = '' then
    begin
      MsgBox('Please enter the activation code.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResCode: Integer;
  Api, Code, Params: String;
begin
  if CurStep <> ssPostInstall then
    Exit;

  Api := GetApiBase;
  Code := GetActivationCode;

  if WizardSilent and ((Api = '') or (Code = '')) then
  begin
    MsgBox('Silent install requires /APIBASE=... and /ACTIVATION=...', mbError, MB_OK);
    Abort;
  end;

  Params := Format('--activate %s --api-base %s', [ShellQuote(Code), ShellQuote(Api)]);

  if not Exec(ExpandConstant('{app}\AttendanceAgent.exe'), Params, ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResCode) then
  begin
    MsgBox('Could not run the activation step.', mbError, MB_OK);
    Abort;
  end;
  if ResCode <> 0 then
  begin
    MsgBox('Activation failed. Check the code and API URL, then run the installer again.' + #13#10 + 'Exit code: ' + IntToStr(ResCode), mbError, MB_OK);
    Abort;
  end;

  if not Exec('powershell.exe',
    '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\install-service-sc.ps1') + '" -InstallPath "' + ExpandConstant('{app}') + '"',
    ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResCode) then
  begin
    MsgBox('Could not install the Windows service.', mbError, MB_OK);
    Abort;
  end;
  if ResCode <> 0 then
  begin
    MsgBox('Service installation script failed. Exit code: ' + IntToStr(ResCode), mbError, MB_OK);
    Abort;
  end;
end;
