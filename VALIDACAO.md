# Validação do PetMatch

A versão local anterior passou em 28 cenários de navegador. A etapa Firebase acrescentou verificações de interface, serviço e autorização:

- 15 cenários de interface com duas contas e Firebase simulado.
- 5 cenários de funcionamento local, sem CDN, incluindo abertura por arquivo e layout de 320 px.
- 20 cenários unitários do serviço e da verificação preventiva de permissões.
- 56 cenários com as regras compiladas e executadas no emulador oficial do Realtime Database.
- 9 cenários integrando o serviço atual com o SDK real do Realtime Database e duas identidades no emulador.

Também foram verificados a sintaxe do JavaScript, os IDs do HTML, os caminhos relativos, a integridade da imagem original dos mascotes e o iniciador Python.

## Conferência no ambiente real

Foram realizadas somente consultas de leitura. Os módulos oficiais do Firebase estão no endereço indicado pelo projeto. A consulta anônima ao caminho de diagnóstico privado de `camada2` recebeu HTTP 200; por isso, o aplicativo bloqueia as leituras e gravações da conta até confirmar a proteção. A autenticação funciona de forma independente desse bloqueio na versão de 22/10/2026. Nenhum teste de conta, mensagem, cadastro ou denúncia foi gravado no banco real.

A publicação das regras e a habilitação do Authentication dependem de acesso administrativo ao Firebase. A publicação no Pages depende de o repositório ter o Pages habilitado. Ter o código no repositório, por si só, não comprova que essas configurações foram aplicadas.

## Login Google e cadastro por e-mail — 20/10/2026

As verificações em `tests/auth.test.mjs` cobrem o provedor Google com seleção de conta, integração com os observadores de sessão e isolamento no logout; erros de popup, configuração e conta existente; cadastro com confirmação de senha; envio do formulário de login; recuperação por e-mail; bloqueio de cliques repetidos e visibilidade da senha. São 13 cenários automatizados, executados com SDK e elementos de interface substituídos por simuladores locais, sem contas ou gravações em produção.

Também foram aprovadas as verificações de sintaxe JavaScript e de unicidade dos IDs do HTML. Não houve verificação visual em navegador nesta atualização. O fluxo real de OAuth depende de Google e E-mail/senha habilitados e do domínio `perabru.github.io` autorizado no console Firebase; estes testes não comprovam que as configurações administrativas foram aplicadas.

## Correções de funcionamento — 22/10/2026

A versão separa a disponibilidade do Authentication da proteção do banco, oferece nova tentativa de sincronização e permite voltar ao modo local. Foram corrigidos resultados pendentes que podiam restaurar uma sessão antiga ou misturar dados locais ao trocar de conta, backups vazios durante o carregamento e rejeição de campos opcionais ausentes. Os estados de erro são visíveis depois de entrar, os alvos de toque têm pelo menos 44 px e o contraste das ações foi ajustado.

Os testes de `tests/*.mjs` verificam autenticação, proteção e recuperação do serviço, operações de sessão e restauração de backup sem acessar contas reais. A interface também foi exercitada em navegador local com respostas simuladas do SDK, incluindo banco bloqueado e posterior recuperação, seis larguras de tela de 320 a 1440 px e recuperação do download do módulo de conexão.

A conferência real de 22/10 encontrou o site publicado e acessível, leitura anônima ainda permitida no sentinel do banco e `perabru.github.io` ausente da lista de domínios autorizados do Authentication. O frontend foi corrigido; aplicar as regras e autorizar o domínio requer acesso administrativo ao Firebase. Não foram criados usuários nem gravados dados de teste em produção.
