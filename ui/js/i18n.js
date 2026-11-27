// Languages: English (the source text of the whole interface) and Brazilian Portuguese.
// The screens are written in English. When Portuguese is on, every piece of text that matches an entry
// below is swapped in place (and swapped back when English is chosen again); anything without an entry
// stays in English. App.t() does the same for text built in code.
(function () {
  const PT = {
    // ----- shell -----
    "Vaults": "Cofres", "SFTP": "SFTP", "Settings": "Configurações", "Menu": "Menu", "Notifications": "Notificações",
    "Minimize": "Minimizar", "Maximize": "Maximizar", "Close": "Fechar", "Vault": "Cofre",
    "Stored on this computer only": "Guardado somente neste computador",
    "New tab (Ctrl+T)": "Nova aba (Ctrl+T)", "No new notifications": "Nenhuma notificação nova",
    "Free": "Grátis", "All features unlocked. Your data stays on this computer.": "Todos os recursos liberados. Seus dados ficam neste computador.",
    "Hosts": "Hosts", "Servers": "Servidores", "Containers": "Containers", "Databases": "Bancos de dados", "Keychain": "Chaveiro",
    "Port Forwarding": "Encaminhamento de portas", "Snippets": "Snippets", "Known Hosts": "Hosts conhecidos", "Logs": "Logs",
    "Rename": "Renomear", "Duplicate": "Duplicar", "Reconnect": "Reconectar", "Close other tabs": "Fechar as outras abas", "Tab Title": "Título da aba", "Title": "Título",
    "Show sidebar": "Mostrar menu lateral", "Hide sidebar": "Ocultar menu lateral", "Collapse menu": "Recolher menu", "Expand menu": "Expandir menu",
    // app menu
    "File": "Arquivo", "Edit": "Editar", "View": "Exibir", "Window": "Janela", "Help": "Ajuda",
    "New Local Terminal": "Novo terminal local", "New Serial Connection": "Nova conexão serial",
    "Copy": "Copiar", "Paste": "Colar", "Select All": "Selecionar tudo", "Select all": "Selecionar tudo", "Find": "Buscar",
    "Toggle Full Screen": "Alternar tela cheia", "Show terminal side-panel": "Mostrar painel lateral do terminal",
    "Increase terminal font size": "Aumentar fonte do terminal", "Decrease terminal font size": "Diminuir fonte do terminal",
    "Reset terminal font size to default": "Restaurar fonte padrão do terminal", "Keyboard shortcuts": "Atalhos de teclado", "About": "Sobre",
    "A free SSH client: hosts, terminal tabs, SFTP, keychain, port forwarding and snippets. Your data stays on this computer.": "Um cliente SSH gratuito: hosts, abas de terminal, SFTP, chaveiro, encaminhamento de portas e snippets. Seus dados ficam neste computador.",
    // ----- settings -----
    "General": "Geral", "Account": "Conta", "Terminal": "Terminal", "Shortcuts": "Atalhos",
    "Language": "Idioma", "Interface language": "Idioma da interface", "English": "English", "Português (Brasil)": "Português (Brasil)",
    "Choose the language of menus, buttons and messages. Text without a translation stays in English.": "Escolha o idioma de menus, botões e mensagens. Textos sem tradução continuam em inglês.",
    "Side menu": "Menu lateral", "Side menu mode": "Modo do menu lateral", "Expanded": "Expandido", "Collapsed (icons only)": "Recolhido (só ícones)", "Hidden": "Oculto",
    "Expanded shows icons and names, collapsed shows only icons, hidden removes the side menu (use the arrow next to Vaults to move around).": "Expandido mostra ícones e nomes, recolhido mostra só os ícones e oculto remove o menu lateral (use a seta ao lado de Cofres para navegar).",
    "Items in the side menu": "Itens do menu lateral", "Choose which screens appear in the side menu. Hosts always stays.": "Escolha quais telas aparecem no menu lateral. Hosts sempre permanece.",
    "Reset to default": "Restaurar padrão", "Always shown": "Sempre visível",
    "Local account": "Conta local", "Free, no sign-in. Everything stays on this computer.": "Grátis, sem login. Tudo fica neste computador.",
    "Saved in": "Salvo em", "this computer": "este computador", "Export everything": "Exportar tudo", "Export": "Exportar",
    "Hosts, keys, snippets and rules as one file (passwords included, keep it safe).": "Hosts, chaves, snippets e regras em um só arquivo (com senhas, guarde com cuidado).",
    "Import a backup": "Importar um backup", "Import": "Importar", "Replaces what is saved now.": "Substitui o que está salvo agora.",
    "Exported": "Exportado", "Imported": "Importado", "Import failed: ": "Falha ao importar: ",
    "Text Size": "Tamanho do texto", "Font": "Fonte", "Fonts not installed on this computer fall back to Cascadia Mono or Consolas.": "Fontes não instaladas neste computador usam Cascadia Mono ou Consolas.",
    "App theme": "Tema do aplicativo", "Dark": "Escuro", "Light": "Claro",
    "Interface animations": "Animações da interface", "System": "Sistema", "Always on": "Sempre ligadas", "Off": "Desligadas",
    "System follows Windows: with animation effects off there, menus and panels only fade.": "Sistema segue o Windows: com os efeitos de animação desligados lá, menus e painéis apenas aparecem suavemente.",
    "Terminal theme": "Tema do terminal", "Terminal settings": "Configurações do terminal",
    "Autoreconnect": "Reconectar automaticamente", "Reconnect up to 3 times when a connection drops.": "Reconecta até 3 vezes quando a conexão cai.",
    "Select text to copy & Right click to paste": "Selecionar para copiar e botão direito para colar", "Copy on select": "Copiar ao selecionar",
    "Bell sound": "Som de sino", "Use bright colours for bold text": "Usar cores brilhantes para texto em negrito",
    "Use this computer's SSH keys": "Usar as chaves SSH deste computador",
    "Hosts without a key or password of their own try the keys in your .ssh folder, like the ssh command does.": "Hosts sem chave ou senha própria tentam as chaves da sua pasta .ssh, como o comando ssh faz.",
    "Show host usage on host cards": "Mostrar uso dos hosts nos cartões",
    "CPU, memory and battery of hosts whose saved login works, refreshed every 10 seconds (Linux hosts).": "CPU, memória e bateria dos hosts cujo login salvo funciona, atualizados a cada 10 segundos (hosts Linux).",
    "Show Docker containers": "Mostrar containers Docker",
    "The Containers screen and a running / stopped count on host cards, for hosts whose saved login works (Docker and Easypanel).": "A tela de Containers e a contagem de ativos / parados nos cartões, para hosts cujo login salvo funciona (Docker e Easypanel).",
    "Keepalive Interval": "Intervalo de keepalive", "How often (in seconds) to send SSH-level keepalive packets to the server. Set to 0 to disable.": "A cada quantos segundos enviar pacotes keepalive SSH ao servidor. Use 0 para desativar.",
    "Scrollback": "Histórico de rolagem", "Limit number of terminal rows. Set to 0 to maximum limit size.": "Limite de linhas do terminal. Use 0 para o tamanho máximo.",
    "Terminal emulation type": "Tipo de emulação do terminal", "Local Terminal Path": "Caminho do terminal local",
    "Empty uses PowerShell on Windows or your login shell elsewhere.": "Vazio usa o PowerShell no Windows ou o seu shell de login nos demais sistemas.",
    "File type associations": "Associações de tipos de arquivo",
    "No file type associations yet. Double-clicking a folder opens it; drag files between the two panes to copy them.": "Nenhuma associação de tipo de arquivo ainda. Clique duas vezes numa pasta para abri-la; arraste arquivos entre os dois painéis para copiá-los.",
    "Delete existing logs": "Apagar logs existentes", "Delete the whole connection history?": "Apagar todo o histórico de conexões?", "Delete": "Apagar", "Logs deleted": "Logs apagados",
    "Keep connection logs": "Guardar logs de conexão", "Control how logs are stored on this computer.": "Controla como os logs são guardados neste computador.", "Saved entries": "Entradas salvas",
    "PC hotkeys": "Atalhos do PC",
    "Copy from Terminal": "Copiar do terminal", "Paste to Terminal": "Colar no terminal", "Select All in Terminal": "Selecionar tudo no terminal",
    "Show Terminal Side-panel": "Mostrar painel lateral do terminal", "Open Local Terminal": "Abrir terminal local", "Open Serial Connection": "Abrir conexão serial",
    "Open Terminal Search": "Abrir busca no terminal", "Close Tab": "Fechar aba", "Open Snippets": "Abrir snippets", "Open Port Forwarding": "Abrir encaminhamento de portas",
    "Open Command Palette": "Abrir paleta de comandos", "Jump to": "Ir para", "New tab": "Nova aba", "Next Tab": "Próxima aba", "Previous Tab": "Aba anterior", "Switch to tab 1-9": "Ir para a aba 1-9",
    // ----- common -----
    "Cancel": "Cancelar", "Save": "Salvar", "Remove": "Remover", "Create": "Criar", "Continue": "Continuar", "Connect": "Conectar", "Open": "Abrir", "Search": "Buscar",
    "Sort": "Ordenar", "More": "Mais", "None": "Nenhum", "Label": "Nome", "Name": "Nome", "Port": "Porta", "Host": "Host", "Type": "Tipo", "Size": "Tamanho", "Kind": "Tipo",
    "Refresh": "Atualizar", "Refresh now": "Atualizar agora", "Start": "Iniciar", "Stop": "Parar", "Run": "Executar", "Clear": "Limpar", "Retry": "Tentar de novo",
    "Copied": "Copiado", "Username": "Usuário", "Password": "Senha", "Tags": "Etiquetas", "Optional": "Opcional", "Key": "Chave", "Group": "Grupo", "Identity": "Identidade", "Status": "Estado",
    "A-z": "A-z", "Z-a": "Z-a", "Newest to oldest": "Mais novos primeiro", "Oldest to newest": "Mais antigos primeiro",
    // ----- hosts -----
    "New Host": "Novo host", "New host": "Novo host", "New Group": "Novo grupo", "New host in group": "Novo host no grupo", "Create host": "Criar host", "All hosts": "Todos os hosts",
    "Find a host or ssh user@hostname...": "Busque um host ou ssh usuario@host...", "Host Details": "Detalhes do host", "Group Details": "Detalhes do grupo",
    "Groups": "Grupos", "Grid": "Grade", "List": "Lista", "Address": "Endereço", "IP or Hostname": "IP ou nome do host", "Type IP or Hostname": "Digite o IP ou nome do host",
    "Icon": "Ícone", "No group": "Sem grupo", "Parent Group": "Grupo pai", "Remove host": "Remover host", "Remove group": "Remover grupo", "Copy address": "Copiar endereço", "Open in SFTP": "Abrir no SFTP",
    "Edit host": "Editar host", "Import from SSH": "Importar do SSH", "Import ~/.ssh/config": "Importar ~/.ssh/config", "OpenSSH config file": "Arquivo de configuração do OpenSSH",
    "Host Chaining": "Encadeamento de hosts", "Add host chain": "Adicionar encadeamento", "Add hop": "Adicionar salto", "Connect through other hosts first (jump hosts).": "Conectar antes por outros hosts (jump hosts).",
    "Environment Variables": "Variáveis de ambiente", "Add variable": "Adicionar variável", "Variable": "Variável", "Value": "Valor", "Agent Forwarding": "Encaminhamento do agente", "Startup Snippet": "Snippet de inicialização",
    "No hosts in this group yet.": "Nenhum host neste grupo ainda.", "Hosts in this group use these when their own fields are empty.": "Os hosts deste grupo usam estes dados quando os campos deles estão vazios.",
    "SSH defaults for hosts in this group": "Padrões SSH dos hosts deste grupo", "Detect automatically": "Detectar automaticamente", "Default (from settings)": "Padrão (das configurações)",
    "Save a server to connect with one click. Type its IP address or name to start.": "Salve um servidor para conectar com um clique. Digite o IP ou o nome para começar.",
    "No hosts match. Press Enter to connect to it directly.": "Nenhum host encontrado. Pressione Enter para conectar direto.", "Type an address first": "Digite um endereço primeiro", "Choose file": "Escolher arquivo",
    "Read the hosts saved in an OpenSSH config file (Host, HostName, User, Port, IdentityFile).": "Lê os hosts salvos num arquivo de configuração do OpenSSH (Host, HostName, User, Port, IdentityFile).",
    "Not available in this version; the setting is kept.": "Indisponível nesta versão; a configuração é mantida.", "SSH on": "SSH em",
    // ----- keychain -----
    "Keys": "Chaves", "Identities": "Identidades", "Credentials": "Credenciais", "Certificate": "Certificado", "New Key": "Nova chave", "New Identity": "Nova identidade", "Key Details": "Detalhes da chave", "Identity Details": "Detalhes da identidade",
    "Generate Key": "Gerar chave", "Generate key": "Gerar chave", "Generate & save": "Gerar e salvar", "Generating...": "Gerando...", "Key type": "Tipo da chave", "Key generated": "Chave gerada", "Key imported": "Chave importada",
    "Import key file": "Importar arquivo de chave", "Import from file": "Importar de arquivo", "Import from this computer": "Importar deste computador", "Import selected": "Importar selecionadas", "Keys on this computer": "Chaves neste computador",
    "Private key": "Chave privada", "Public key": "Chave pública", "Private key file": "Arquivo da chave privada", "Passphrase": "Frase secreta", "Copy public key": "Copiar chave pública", "Public key copied": "Chave pública copiada",
    "Remove key": "Remover chave", "Remove identity": "Remover identidade", "Your keychain is empty": "Seu chaveiro está vazio", "Keys and identities saved here can be attached to any host.": "Chaves e identidades salvas aqui podem ser usadas em qualquer host.",
    "Needs passphrase": "Pede frase secreta", "Already in your keychain": "Já está no seu chaveiro", "In keychain": "No chaveiro", "Ready": "Pronta", "Not supported": "Sem suporte", "From this computer (.ssh)": "Deste computador (.ssh)",
    // ----- forwarding -----
    "New Forwarding": "Novo encaminhamento", "New Port Forwarding": "Novo encaminhamento de porta", "Port Forwarding Rule": "Regra de encaminhamento de porta", "Local Forwarding": "Encaminhamento local", "Remote Forwarding": "Encaminhamento remoto", "Dynamic Forwarding": "Encaminhamento dinâmico",
    "Local": "Local", "Remote": "Remoto", "Dynamic": "Dinâmico", "Bind address": "Endereço de escuta", "Destination address": "Endereço de destino", "Port on this computer": "Porta neste computador", "Port on the server": "Porta no servidor",
    "Host to tunnel through": "Host para o túnel", "Select a host": "Selecione um host", "Remove rule": "Remover regra", "Set up port forwarding": "Configurar encaminhamento de portas", "Started": "Iniciado",
    "Choose a host for this rule first": "Escolha um host para esta regra primeiro", "Set the port first": "Defina a porta primeiro", "Port forwarding failed: ": "Falha no encaminhamento: ",
    "Destination (seen from the server)": "Destino (visto a partir do servidor)", "Send connections to (from this computer)": "Enviar conexões para (a partir deste computador)", "Server (where the port opens)": "Servidor (onde a porta abre)",
    "Point a browser or app at this SOCKS5 proxy to reach anything the server can reach.": "Aponte um navegador ou app para este proxy SOCKS5 para acessar tudo que o servidor alcança.",
    // ----- snippets -----
    "Snippet": "Snippet", "New Snippet": "Novo snippet", "Snippet Details": "Detalhes do snippet", "Script": "Script", "Package": "Pacote", "Packages": "Pacotes", "New Package": "Novo pacote", "Rename package": "Renomear pacote", "Remove package": "Remover pacote", "Remove snippet": "Remover snippet",
    "All snippets": "Todos os snippets", "No package": "Sem pacote", "Open tab": "Abrir aba", "Paste into current terminal": "Colar no terminal atual", "Save commands you use often": "Salve comandos que você usa com frequência",
    "Run a snippet in an open terminal, or on several hosts at once.": "Execute um snippet num terminal aberto ou em vários hosts de uma vez.", "This snippet is empty": "Este snippet está vazio", "Example: check network load": "Exemplo: ver carga da rede",
    // ----- known hosts / logs -----
    "No known hosts yet": "Nenhum host conhecido ainda", "Copy fingerprint": "Copiar impressão digital", "Remove known host": "Remover host conhecido",
    "Clear logs": "Limpar logs", "Connect again": "Conectar de novo", "No logs yet": "Nenhum log ainda", "Each connection you open is listed here.": "Cada conexão que você abre aparece aqui.", "Logs are turned off in Settings.": "Os logs estão desativados nas Configurações.", "Local terminal": "Terminal local",
    // ----- sftp -----
    "Actions": "Ações", "Add a host in the Hosts screen to browse its files here.": "Adicione um host na tela Hosts para navegar pelos arquivos dele aqui.", "Connected": "Conectado", "Connecting...": "Conectando...", "Loading...": "Carregando...",
    "Copy path": "Copiar caminho", "Copy to target directory": "Copiar para a pasta de destino", "Date Modified": "Data de modificação", "Files on this computer": "Arquivos deste computador", "New folder": "Nova pasta", "New name": "Novo nome",
    "No saved hosts yet": "Nenhum host salvo ainda", "Select host": "Selecionar host", "Up": "Subir", "Transfer failed: ": "Falha na transferência: ",
    "Copy between two servers through this computer: download first, then upload.": "Copie entre dois servidores por este computador: baixe primeiro, depois envie.",
    // ----- palette / terminal -----
    "Local Terminal": "Terminal local", "Open SFTP": "Abrir SFTP", "Quick connect": "Conexão rápida", "Search hosts or tabs": "Buscar hosts ou abas", "Tabs": "Abas", "Serial": "Serial",
    "Authentication required": "Autenticação necessária", "Enter your credentials": "Informe suas credenciais", "Add and continue": "Adicionar e continuar", "Replace and continue": "Substituir e continuar", "Save to host": "Salvar no host",
    "Connection failed": "Falha na conexão", "Disconnected": "Desconectado", "Closed": "Fechado", "Opened": "Aberto", "Host key changed": "Chave do host mudou", "Unknown host": "Host desconhecido", "Key passphrase": "Frase secreta da chave",
    "Wrong username or password": "Usuário ou senha incorretos", "Start again": "Recomeçar", "Show side panel": "Mostrar painel lateral", "Themes": "Temas", "Next": "Próximo", "Previous": "Anterior", "Baud rate": "Taxa de transmissão",
    "Clipboard is not available": "Área de transferência indisponível", "No serial ports were found on this computer.": "Nenhuma porta serial encontrada neste computador.", "No snippets yet. Add them in the Snippets screen.": "Nenhum snippet ainda. Adicione na tela Snippets.",
    "Could not start the local terminal": "Não foi possível iniciar o terminal local", "Could not open the serial port": "Não foi possível abrir a porta serial",
    // ----- servers / containers / databases -----
    "Average": "Média", "Busiest containers": "Containers mais ocupados", "By service": "Por serviço", "CPU and memory": "CPU e memória", "CPU": "CPU", "RAM": "RAM", "Memory": "Memória", "Network": "Rede",
    "Disk ": "Disco ", "Errors 5xx": "Erros 5xx", "Latest 5xx errors": "Últimos erros 5xx", "Live, every 2 seconds while this screen is open": "Ao vivo, a cada 2 segundos enquanto esta tela está aberta",
    "Lost contact": "Sem contato", "Lost contact, showing the last numbers. ": "Sem contato, mostrando os últimos números. ", "No servers to watch yet": "Nenhum servidor para acompanhar ainda", "Open terminal": "Abrir terminal", "Other disks": "Outros discos",
    "Requests per second": "Requisições por segundo", "Requests": "Requisições", "Response time": "Tempo de resposta", "Sent to visitors": "Enviado aos visitantes", "Sent": "Enviado", "Service": "Serviço", "Show fewer": "Mostrar menos",
    "Time since the server last started": "Tempo desde a última inicialização do servidor", "Traefik traffic": "Tráfego do Traefik", "Uptime": "Tempo ativo",
    "Can't reach this host right now. Trying again in a minute.": "Não foi possível alcançar este host agora. Tentando de novo em um minuto.", "Containers are turned off": "Os containers estão desativados",
    "Copy name": "Copiar nome", "Docker is installed but not running.": "O Docker está instalado, mas não está rodando.", "Docker isn't installed on this host.": "O Docker não está instalado neste host.",
    "Find a container, image or project": "Busque um container, imagem ou projeto", "No Docker hosts yet": "Nenhum host com Docker ainda", "No containers on this host.": "Nenhum container neste host.", "No project": "Sem projeto",
    "Nothing matches.": "Nada encontrado.", "Only problems and stopped": "Só problemas e parados", "Open containers": "Abrir containers", "Received / sent since the container started": "Recebido / enviado desde que o container iniciou",
    "Restart": "Reiniciar", "Restarting": "Reiniciando", "Shell": "Shell", "Starting": "Iniciando", "Stopped": "Parado", "Stopping": "Parando",
    "Buffer pool hit": "Acerto do buffer pool", "Cache hit": "Acerto de cache", "Click to copy the command": "Clique para copiar o comando", "Click to copy the statement": "Clique para copiar a instrução", "Clients": "Clientes", "Command": "Comando",
    "Connections": "Conexões", "Couldn't read this database.": "Não foi possível ler este banco.", "Database": "Banco de dados", "Deadlocks": "Deadlocks", "Empty Redis": "Esvaziar Redis", "Empty it": "Esvaziar", "Empty this Redis (delete every key)": "Esvaziar este Redis (apagar todas as chaves)",
    "Emptying ": "Esvaziando ", "Evicted keys": "Chaves removidas", "Failed": "Falhou", "Find a database by name, image or type": "Busque um banco por nome, imagem ou tipo", "Hit rate": "Taxa de acerto", "InnoDB waiting right now": "InnoDB aguardando agora",
    "Keyspace": "Keyspace", "Last save": "Último salvamento", "No PostgreSQL, MySQL or Redis containers are running on this host.": "Nenhum container PostgreSQL, MySQL ou Redis está rodando neste host.", "No databases found": "Nenhum banco encontrado", "No hosts to read yet": "Nenhum host para ler ainda",
    "No statement is running.": "Nenhuma instrução em execução.", "Nothing slow has been logged.": "Nada lento foi registrado.", "Only PostgreSQL, MySQL / MariaDB and Redis running as Docker containers are shown.": "Só aparecem PostgreSQL, MySQL / MariaDB e Redis rodando como containers Docker.",
    "Open a shell in this container": "Abrir um shell neste container", "Open the Redis console (redis-cli)": "Abrir o console do Redis (redis-cli)", "Operations / s": "Operações / s", "Queries / s": "Consultas / s", "Read only · every 10 s": "Somente leitura · a cada 10 s",
    "Row lock waits": "Esperas de bloqueio de linha", "Running now": "Em execução agora", "Schemas": "Schemas", "Slow log": "Log de lentas", "Slow queries": "Consultas lentas", "State": "Estado", "Statement": "Instrução", "Tables": "Tabelas", "Time": "Hora", "Took": "Levou",
    "Traffic": "Tráfego", "Transactions / s": "Transações / s", "User · database": "Usuário · banco", "Waiting on locks": "Aguardando bloqueios", "When": "Quando", "Reading usage...": "Lendo uso...", "Charging": "Carregando",
    // ----- cloudflare -----
    "Cloudflare": "Cloudflare", "Connect your Cloudflare": "Conecte seu Cloudflare",
    "Create an API token in the Cloudflare dashboard (My Profile → API Tokens → Create Token → Custom token) with read-only permissions, then paste it here. It stays on this computer.": "Crie um token de API no painel da Cloudflare (Meu Perfil → Tokens de API → Criar token → Token personalizado) só com permissões de leitura e cole aqui. Ele fica neste computador.",
    "Permissions (read only)": "Permissões (somente leitura)", "Cloudflare API token": "Token de API da Cloudflare", "Token": "Token", "Change API token": "Trocar token de API", "Disconnect Cloudflare": "Desconectar Cloudflare",
    "Zone → Zone: Read": "Zona → Zona: Leitura", "Zone → Analytics: Read": "Zona → Análises: Leitura", "Zone → DNS: Read": "Zona → DNS: Leitura", "Zone → Zone Settings: Read": "Zona → Configurações da zona: Leitura",
    "Account → Cloudflare Tunnel: Read, Workers Scripts: Read, Cloudflare Pages: Read, Workers R2 Storage: Read (optional)": "Conta → Cloudflare Tunnel: Leitura, Workers Scripts: Leitura, Cloudflare Pages: Leitura, Workers R2 Storage: Leitura (opcional)",
    "Connect": "Conectar", "Couldn't read Cloudflare": "Não foi possível ler a Cloudflare", "Reading Cloudflare...": "Lendo a Cloudflare...", "No domains found": "Nenhum domínio encontrado",
    "This token can't see any domain. Give it Zone → Zone: Read for the domains you want here.": "Este token não enxerga nenhum domínio. Dê a ele Zona → Zona: Leitura para os domínios que você quer ver aqui.",
    "Check that the token is active and has the read permissions listed when connecting.": "Confira se o token está ativo e tem as permissões de leitura listadas ao conectar.", "Check your internet connection and try again.": "Confira sua conexão com a internet e tente de novo.",
    "Traffic numbers unavailable: ": "Números de tráfego indisponíveis: ", "The token needs Zone → Analytics: Read.": "O token precisa de Zona → Análises: Leitura.",
    "Firewall events unavailable: ": "Eventos do firewall indisponíveis: ", "The token needs Zone → Analytics: Read, and some plans keep only a short history.": "O token precisa de Zona → Análises: Leitura, e alguns planos guardam só um histórico curto.",
    "Last 24 hours": "Últimas 24 horas", "Last 7 days": "Últimos 7 dias", "Last 30 days": "Últimos 30 dias", "All domains ": "Todos os domínios",
    "Visitors": "Visitantes", "Page views": "Visualizações de página", "Bandwidth": "Banda", "Cache hit rate": "Taxa de cache", "Threats": "Ameaças",
    "sum of hourly unique visitors": "soma dos visitantes únicos por hora", "sum of daily unique visitors": "soma dos visitantes únicos por dia",
    "Cached": "Em cache", "Not cached": "Sem cache", "Errors 4xx": "Erros 4xx", "Errors and threats": "Erros e ameaças", "Domain": "Domínio", "Plan": "Plano", "DNS": "DNS", "SSL": "SSL", "Security": "Segurança", "Dev mode": "Modo dev", "Paused": "Pausado",
    "Domains": "Domínios", "Status codes": "Códigos de status", "Countries": "Países", "Browsers": "Navegadores", "Content types": "Tipos de conteúdo", "TLS versions": "Versões de TLS", "Not encrypted": "Sem criptografia", "page views": "visualizações",
    "Nothing in this period": "Nada neste período", "Security: firewall and bots": "Segurança: firewall e bots", "Reading...": "Lendo...", "Stopped by": "Barrado por", "Action taken": "Ação tomada", "Top paths hit": "Caminhos mais atacados", "Top IP addresses": "IPs mais frequentes", "No firewall events": "Nenhum evento de firewall",
    "Tunnels": "Túneis", "Workers": "Workers", "Pages projects": "Projetos Pages", "R2 buckets": "Buckets R2", "no access": "sem acesso",
    "Bot Fight Mode": "Bot Fight Mode", "Bot Management": "Gerenciamento de bots", "User-agent rules": "Regras de user-agent", "Browser integrity check": "Verificação de integridade do navegador", "Hotlink protection": "Proteção contra hotlink",
    "HTTP DDoS protection": "Proteção DDoS HTTP", "Rate limiting": "Limite de taxa", "Security level": "Nível de segurança", "WAF managed rules": "Regras gerenciadas do WAF", "Firewall rules": "Regras de firewall", "Managed rules": "Regras gerenciadas", "Custom rules": "Regras personalizadas",
    "Block": "Bloquear", "Challenge": "Desafio", "JS challenge": "Desafio JS", "Managed challenge": "Desafio gerenciado", "Allow": "Permitir", "Log": "Registrar", "Skip": "Ignorar", "Bypass": "Contornar", "Challenge solved": "Desafio resolvido", "Challenge failed": "Desafio falhou",
    "Request failed": "A requisição falhou", "Invalid API token": "Token de API inválido",
    // ----- dialogs / misc -----
    "Delete existing logs ": "Apagar logs existentes ", "Hardware security keys (FIDO2) are not supported in this version.": "Chaves de segurança de hardware (FIDO2) não são suportadas nesta versão.",
    "Hardware security keys are not supported in this version.": "Chaves de segurança de hardware não são suportadas nesta versão.",
    "Certificates are added inside a key: open the key in Keychain and paste its certificate.": "Certificados são adicionados dentro de uma chave: abra a chave no Chaveiro e cole o certificado.",
  };

  // Text with a number or name inside: matched by shape.
  const PATTERNS = [
    [/^(.+) of (.+) requests$/, "$1 de $2 requisições"], [/^(.+) of requests$/, "$1 das requisições"], [/^(.+) cached$/, "$1 em cache"],
    [/^(.+) threats$/, "$1 ameaças"], [/^(.+) bot events · (.+) firewall events$/, "$1 eventos de bots · $2 eventos de firewall"],
    [/^(\d+) · click one to filter$/, "$1 · clique para filtrar"], [/^(.+) from bots$/, "$1 de bots"], [/^last 24 hours$/, "últimas 24 horas"], [/^last 7 days$/, "últimos 7 dias"], [/^last 30 days$/, "últimos 30 dias"],
    [/^Updated just now$/, "Atualizado agora"], [/^Updated (\d+) min ago$/, "Atualizado há $1 min"], [/^(\d+) tunnel down$/, "$1 túnel fora do ar"], [/^Account: (.+)$/, "Conta: $1"],
    [/^Last (\d+) min$/, "Últimos $1 min"],
  ];
  const tr = (s) => {
    if (PT[s] !== undefined) return PT[s];
    for (const [re, out] of PATTERNS) if (re.test(s)) return s.replace(re, out);
    return undefined;
  };
  let lang = "en";
  const SKIP = "script,style,textarea,.xterm,[data-no-i18n]";
  const textOrig = new WeakMap(); // text node -> original English
  const textSet = new WeakMap();  // text node -> what we last wrote
  const attrOrig = new WeakMap(); // element -> { attr: original }
  const attrSet = new WeakMap();  // element -> { attr: last written }
  const ATTRS = ["title", "placeholder", "aria-label"];

  const detect = () => ((navigator.language || "en").toLowerCase().startsWith("pt") ? "pt-BR" : "en");
  App.defaultLanguage = detect;
  const lookup = (s) => (lang === "pt-BR" && tr(s) !== undefined ? tr(s) : s);

  // For text built in code: App.t("Exported"), App.t("Remove {name}?", { name }).
  App.t = (s, vars) => {
    let out = lookup(s);
    if (vars) for (const k of Object.keys(vars)) out = out.split("{" + k + "}").join(vars[k]);
    return out;
  };
  App.language = () => lang;

  const skipped = (el) => !el || (el.closest && el.closest(SKIP));

  const doText = (n) => {
    if (skipped(n.parentElement)) return;
    const last = textSet.get(n);
    if (last !== undefined && n.nodeValue === last) { /* ours */ }
    else textOrig.set(n, n.nodeValue); // new or changed by the app: this is the English text now
    const base = textOrig.get(n);
    const core = base.trim();
    if (!core) return;
    const next = lang === "pt-BR" && tr(core) !== undefined ? base.replace(core, tr(core)) : base;
    if (next !== n.nodeValue) n.nodeValue = next;
    textSet.set(n, n.nodeValue);
  };

  const doAttrs = (el) => {
    if (skipped(el)) return;
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      const o = attrOrig.get(el) || {}, s = attrSet.get(el) || {};
      if (s[a] === undefined || cur !== s[a]) o[a] = cur;
      const t = lang === "pt-BR" && tr(o[a]) !== undefined ? tr(o[a]) : o[a];
      if (t !== cur) el.setAttribute(a, t);
      s[a] = t;
      attrOrig.set(el, o); attrSet.set(el, s);
    }
  };

  const walk = (root) => {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1) return;
    doAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) (n.nodeType === 3 ? doText(n) : doAttrs(n));
  };

  let observer = null;
  const observe = () => {
    if (observer) return;
    observer = new MutationObserver((list) => {
      observer.disconnect();
      for (const m of list) {
        if (m.type === "childList") m.addedNodes.forEach(walk);
        else if (m.type === "characterData") doText(m.target);
        else if (m.type === "attributes") doAttrs(m.target);
      }
      connect();
    });
    connect();
  };
  const connect = () => observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });

  // Called after the saved settings are read, and again whenever they change.
  App.applyLanguage = () => {
    const want = App.data.settings.language === "pt-BR" ? "pt-BR" : "en";
    document.documentElement.lang = want === "pt-BR" ? "pt-BR" : "en";
    if (observer) observer.disconnect();
    lang = want;
    if (document.body) walk(document.body);
    if (!observer) observe(); else connect();
  };
})();
