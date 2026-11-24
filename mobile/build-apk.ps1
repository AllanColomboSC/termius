$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    & flutter build apk --release
    if ($LASTEXITCODE -ne 0) { throw 'A compilação falhou; o APK para download não foi substituído.' }
    $apk = Join-Path $PSScriptRoot 'build/app/outputs/flutter-apk/app-release.apk'
    if (!(Test-Path -LiteralPath $apk)) { throw 'A compilação não produziu o APK esperado.' }
    $downloads = Join-Path $PSScriptRoot '../downloads'
    Copy-Item -LiteralPath $apk -Destination (Join-Path $downloads 'Shellbox-teste.apk') -Force
    $hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash
    @"
APK atualizado: chave com passphrase abre com a senha do host.
Versão: 0.1.4+5
Arquivo: Shellbox-teste.apk
Gerado em: $(Get-Date -Format o)
SHA256: $hash
Pacote de teste com assinatura de desenvolvimento.
Transfira para o Android e abra para atualizar a instalação existente.
"@ | Set-Content -LiteralPath (Join-Path $downloads 'LEIA-ME.txt') -Encoding utf8
    Write-Output "APK atualizado: $downloads/Shellbox-teste.apk"
} finally {
    Pop-Location
}
