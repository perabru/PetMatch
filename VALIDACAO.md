# Validação do PetMatch

A versão local anterior passou em 28 cenários de navegador. A etapa Firebase acrescentou verificações de interface, serviço e autorização:

- 15 cenários de interface com duas contas e Firebase simulado.
- 5 cenários de funcionamento local, sem CDN, incluindo abertura por arquivo e layout de 320 px.
- 20 cenários unitários do serviço e da verificação preventiva de permissões.
- 56 cenários com as regras compiladas e executadas no emulador oficial do Realtime Database.
- 9 cenários integrando o serviço atual com o SDK real do Realtime Database e duas identidades no emulador.

Também foram verificados a sintaxe do JavaScript, os IDs do HTML, os caminhos relativos, a integridade da imagem original dos mascotes e o iniciador Python.

## Conferência no ambiente real

Foram realizadas somente consultas de leitura. Os módulos oficiais do Firebase estão no endereço indicado pelo projeto. A consulta anônima ao caminho de diagnóstico privado de `camada2` recebeu HTTP 200; por isso, o aplicativo bloqueia a sincronização antes de carregar Auth ou iniciar leituras/gravações da conta. Nenhum teste de conta, mensagem, cadastro ou denúncia foi gravado no banco real.

A publicação das regras e a habilitação do Authentication dependem de acesso administrativo ao Firebase. A publicação no Pages depende de o repositório ter o Pages habilitado. Ter o código no repositório, por si só, não comprova que essas configurações foram aplicadas.
