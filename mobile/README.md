# Shellbox para Android

APK de teste disponível em `../downloads/Shellbox-teste.apk`.

Transfira o arquivo para o celular Android, abra-o e permita a instalação por esse aplicativo quando o Android solicitar. Este pacote usa assinatura de desenvolvimento e é destinado a testes pessoais.

**Estado do pacote:** compilação existente de 20/11/2026 às 17:29, anterior à última alteração da paleta de cores. A recompilação nesta sessão não foi confirmada; não é um APK atualizado do código atual.

Para gerar e disponibilizar o pacote atualizado em um ambiente com Flutter e Android SDK configurados, execute `powershell -ExecutionPolicy Bypass -File build-apk.ps1` nesta pasta. O script só substitui `../downloads/Shellbox-teste.apk` depois de uma compilação bem-sucedida, e registra a versão e o SHA256 em `LEIA-ME.txt`.
