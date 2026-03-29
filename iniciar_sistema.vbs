Set WshShell = CreateObject("WScript.Shell")

' Obtener la ruta del directorio actual
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Iniciar el servidor backend de forma oculta
' El "0" al final indica que la ventana debe estar oculta
WshShell.CurrentDirectory = strPath & "\backend"
WshShell.Run "node server.js", 0, False

' Esperar 3 segundos para asegurar que el servidor suba
WScript.Sleep 3000

' Abrir el frontend en el navegador predeterminado
WshShell.Run """" & strPath & "\frontend\index.html" & """"
