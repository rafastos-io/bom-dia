' Inicia o Bom Dia na bandeja do Windows, sem nenhuma janela de terminal.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
pythonw = "C:\Users\rafaa\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe"
script = pasta & "\Bom Dia.pyw"
sh.CurrentDirectory = pasta
' 0 = janela oculta ; False = nao esperar terminar
sh.Run """" & pythonw & """ """ & script & """", 0, False
