#define MyAppName "TabTome"
#define MyAppVersion "0.11.1"
#define MyAppExeName "TabTomeSettings.exe"
#ifndef MyAppId
  #define MyAppId "{{868E78F5-E114-41D3-A291-56EC79550552}"
#endif

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher=TabTome contributors
DefaultDirName={localappdata}\Programs\TabTome
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir=..\outputs
OutputBaseFilename=TabTome-Setup-{#MyAppVersion}
SetupIconFile=stage\app\TabTome.ico
UninstallDisplayIcon={app}\TabTome.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
ChangesEnvironment=no
VersionInfoVersion=0.11.1.0
VersionInfoProductName={#MyAppName}
VersionInfoDescription=Windows app for the TabTome browser extension
VersionInfoCompany=TabTome contributors
VersionInfoCopyright=TabTome contributors

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[Files]
Source: "stage\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
Root: HKCU; Subkey: "Software\Mozilla\NativeMessagingHosts\page_to_ereader_local"; ValueType: string; ValueName: ""; ValueData: "{app}\host\manifest.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Google\Chrome\NativeMessagingHosts\page_to_ereader_local"; ValueType: string; ValueName: ""; ValueData: "{app}\host\chrome-manifest.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Chromium\NativeMessagingHosts\page_to_ereader_local"; ValueType: string; ValueName: ""; ValueData: "{app}\host\chrome-manifest.json"; Flags: uninsdeletekey

[Icons]
Name: "{group}\Настройки TabTome"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\TabTome.ico"
Name: "{group}\Удалить TabTome"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Настроить почту и проверить SMTP"; Flags: postinstall nowait skipifsilent

[UninstallDelete]
Type: files; Name: "{app}\host\manifest.json"
Type: files; Name: "{app}\host\chrome-manifest.json"
Type: files; Name: "{app}\host\node-path.txt"
Type: files; Name: "{app}\host\data-root.txt"
Type: dirifempty; Name: "{app}\host"
Type: dirifempty; Name: "{app}"

[Code]
var
  PreviousManifestPath: String;
  RemoveUserData: Boolean;

function JsonPath(const Value: String): String;
begin
  Result := Value;
  StringChangeEx(Result, '\', '\\', True);
end;

function UserDataDirectory(): String;
begin
  Result := ExpandConstant('{param:DataDir|{localappdata}\PageToEreaderLocal}');
end;

procedure CopyLegacyFile(const Source, Destination: String);
begin
  if FileExists(Source) and (not FileExists(Destination)) then
  begin
    ForceDirectories(ExtractFileDir(Destination));
    if CopyFile(Source, Destination, False) then
      Log('Migrated legacy user file: ' + Source)
    else
      Log('Could not migrate legacy user file: ' + Source);
  end;
end;

procedure MigrateLegacySettings;
var
  OldHostDirectory: String;
  OldServerDirectory: String;
  DataDirectory: String;
begin
  if (PreviousManifestPath = '') or
     (CompareText(PreviousManifestPath, ExpandConstant('{app}\host\manifest.json')) = 0) then
    Exit;

  OldHostDirectory := ExtractFileDir(PreviousManifestPath);
  OldServerDirectory := ExpandFileName(AddBackslash(OldHostDirectory) + '..\server');
  DataDirectory := UserDataDirectory();
  if CompareText(OldServerDirectory, ExpandConstant('{app}\server')) = 0 then
    Exit;

  CopyLegacyFile(AddBackslash(OldServerDirectory) + '.env', AddBackslash(DataDirectory) + '.env');
  CopyLegacyFile(AddBackslash(OldServerDirectory) + '.smtp-pass', AddBackslash(DataDirectory) + '.smtp-pass');
  CopyLegacyFile(AddBackslash(OldServerDirectory) + 'data\settings.json', AddBackslash(DataDirectory) + 'data\settings.json');
end;

procedure WriteNativeManifest;
var
  AppDirectory: String;
  HostDirectory: String;
  DataDirectory: String;
  Manifest: String;
begin
  AppDirectory := ExpandConstant('{app}');
  HostDirectory := AddBackslash(AppDirectory) + 'host';
  DataDirectory := UserDataDirectory();
  ForceDirectories(HostDirectory);
  ForceDirectories(DataDirectory);
  ForceDirectories(AddBackslash(DataDirectory) + 'data\jobs');
  ForceDirectories(AddBackslash(DataDirectory) + 'logs');

  Manifest := '{' + #13#10 +
    '  "name": "page_to_ereader_local",' + #13#10 +
    '  "description": "TabTome native host",' + #13#10 +
    '  "path": "' + JsonPath(AddBackslash(HostDirectory) + 'TabTomeHost.exe') + '",' + #13#10 +
    '  "type": "stdio",' + #13#10 +
    '  "allowed_extensions": ["page-to-ereader-local@local"]' + #13#10 +
    '}' + #13#10;

  if not SaveStringToFile(AddBackslash(HostDirectory) + 'manifest.json', Manifest, False) then
    RaiseException('Could not write the Firefox Native Messaging manifest.');
  Manifest := '{' + #13#10 +
    '  "name": "page_to_ereader_local",' + #13#10 +
    '  "description": "TabTome native host",' + #13#10 +
    '  "path": "' + JsonPath(AddBackslash(HostDirectory) + 'TabTomeHost.exe') + '",' + #13#10 +
    '  "type": "stdio",' + #13#10 +
    '  "allowed_origins": ["chrome-extension://fmmlphejpodoaipafggdhgklelkkdleh/"]' + #13#10 +
    '}' + #13#10;
  if not SaveStringToFile(AddBackslash(HostDirectory) + 'chrome-manifest.json', Manifest, False) then
    RaiseException('Could not write the Chrome Native Messaging manifest.');
  if not SaveStringToFile(AddBackslash(HostDirectory) + 'node-path.txt', AddBackslash(AppDirectory) + 'runtime\node.exe', False) then
    RaiseException('Could not write the bundled Node.js path.');
  if not SaveStringToFile(AddBackslash(HostDirectory) + 'data-root.txt', DataDirectory, False) then
    RaiseException('Could not write the user data path.');
end;

procedure DeleteLegacyApplicationFiles;
var
  LegacyFile: String;
begin
  LegacyFile := ExpandConstant('{app}\PageToEreaderSettings.exe');
  if FileExists(LegacyFile) and (not DeleteFile(LegacyFile)) then
    Log('Could not remove legacy settings executable: ' + LegacyFile);
  LegacyFile := ExpandConstant('{app}\host\PageToEreaderHost.exe');
  if FileExists(LegacyFile) and (not DeleteFile(LegacyFile)) then
    Log('Could not remove legacy native host executable: ' + LegacyFile);
  LegacyFile := ExpandConstant('{app}\PageToEreader.ico');
  if FileExists(LegacyFile) and (not DeleteFile(LegacyFile)) then
    Log('Could not remove legacy application icon: ' + LegacyFile);
end;

function InitializeSetup(): Boolean;
begin
  PreviousManifestPath := '';
  RegQueryStringValue(HKCU, 'Software\Mozilla\NativeMessagingHosts\page_to_ereader_local', '', PreviousManifestPath);
  RemoveUserData := False;
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if CompareText(ExpandConstant('{param:NoMigrate|0}'), '1') <> 0 then
      MigrateLegacySettings;
    WriteNativeManifest;
    DeleteLegacyApplicationFiles;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    RemoveUserData := SuppressibleMsgBox(
      'Удалить также SMTP-настройки, защищённый пароль, историю заданий и журналы?' + #13#10 + #13#10 +
      'Выберите «Нет», если планируете переустановить или обновить приложение.',
      mbConfirmation, MB_YESNO or MB_DEFBUTTON2, IDNO) = IDYES;

  if (CurUninstallStep = usPostUninstall) and RemoveUserData then
    DelTree(UserDataDirectory(), True, True, True);
end;
