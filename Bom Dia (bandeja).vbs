' Inicia o Bom Dia na bandeja do Windows, sem nenhuma janela de terminal.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
' Usa uma copia do pythonw.exe renomeada para "Bom Dia.exe" (fica NA PASTA DO
' PYTHON, junto do python314.dll de que ela depende). Assim o processo aparece
' como "Bom Dia" no gerenciador/dashboard, em vez de "pythonw".
' Se a copia nao existir, cai de volta no pythonw padrao.
pythonw = "C:\Users\rafaa\AppData\Local\Python\pythoncore-3.14-64\Bom Dia.exe"
If Not fso.FileExists(pythonw) Then
    pythonw = "C:\Users\rafaa\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe"
End If
script = pasta & "\Bom Dia.pyw"
sh.CurrentDirectory = pasta
' 0 = janela oculta ; False = nao esperar terminar
sh.Run """" & pythonw & """ """ & script & """", 0, False
