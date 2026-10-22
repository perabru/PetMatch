# PetMatch

Site responsivo de amizade e adoção de pets, com os dois cachorros da imagem fornecida como mascotes da página inicial. HTML, CSS e JavaScript sem etapa de instalação ou build.

## Publicação no GitHub Pages

O código está preparado para o endereço `https://perabru.github.io/PetMatch/`, com todos os caminhos relativos.

1. Em **Settings → Pages**, selecione **GitHub Actions** no campo **Source**.
2. Em **Actions**, abra **Publicar PetMatch no GitHub Pages** e use **Run workflow**. Novas alterações em `main` publicam automaticamente.
3. O endereço oficial do site aparece no resultado da etapa **Publicar** e na área **Deployments** do repositório.

A primeira execução pode falhar se o Pages ainda não estiver habilitado. O workflow não cria tokens nem muda configurações administrativas da conta. Outra opção de hospedagem estática é selecionar **Deploy from a branch → main → /(root)** em Pages; nesse caso, o GitHub publica a raiz diretamente, independentemente do workflow personalizado.

## Firebase: configuração necessária

A configuração pública fornecida para o projeto **camada2** já está em `firebase-service.js`, com SDK 13.0.0. A chave de configuração web identifica o aplicativo; as regras e o Authentication são responsáveis pela autorização. Nenhuma credencial administrativa pertence ao frontend ou a este repositório.

**Verificação de 22/10/2026:** a consulta anônima a um caminho privado inexistente de `petmatchV1/users` recebeu HTTP 200. Isso indica que as regras atuais permitem leitura anônima nessa área. Para não enviar dados pessoais a uma área sem proteção, o app bloqueia a inicialização da sincronização até que a consulta retorne 401/403. Login, cadastro, acesso com Google e recuperação de senha são independentes dessa verificação e podem ser usados quando os respectivos métodos estiverem habilitados no Authentication. Os registros da conta só ficam disponíveis depois da proteção do banco ser confirmada. O modo local continua funcionando. Nenhum dado de teste foi gravado no projeto de produção.

Para liberar o modo online:

1. No console Firebase do projeto `camada2`, abra **Authentication → Sign-in method** e habilite **E-mail/senha** e **Google**. No Google, selecione o e-mail de suporte solicitado e salve.
2. Em **Authentication → Settings → Authorized domains**, adicione `perabru.github.io` para os fluxos de autenticação executados pelo site. Não inclua protocolo ou `/PetMatch/`.
3. Em **Realtime Database → Rules**, aplique as regras de `rules/database.rules.json`, observando a seção seguinte para preservar outros aplicativos que usem o mesmo banco.
4. No site, use **Tentar conexão novamente** para verificar as novas regras. O painel mostra o serviço de contas e a sincronização separadamente. Se o download dos componentes do Firebase falhar, o botão **Recarregar página** refaz o carregamento; os dados locais já salvos são mantidos.

### Aplicar regras em um banco já usado por outros aplicativos

`rules/database.rules.json` contém apenas o namespace `petmatchV1`. **Não substitua regras de outros sistemas sem incorporá-las ao resultado.** Faça uma cópia das regras atuais antes de editar.

- Se o banco é exclusivo do PetMatch, o arquivo inteiro pode ser usado como configuração de regras.
- Se o projeto é compartilhado, acrescente ou substitua somente `rules.petmatchV1`, preservando as regras dos demais namespaces.
- Uma permissão `.read: true` ou `.write: true` na raiz, ou outra expressão ampla que conceda acesso à raiz, continua válida para todos os filhos e não pode ser anulada por regras mais restritas em `petmatchV1`.
- Nesse caso, antes de publicar, mova as permissões necessárias de cada aplicativo antigo para o namespace daquele aplicativo e deixe a raiz sem concessões amplas. Não remova os dados dos aplicativos. A organização exata depende das regras e dos caminhos existentes.
- Não use regras públicas globais para corrigir mensagens de acesso negado.

As regras incluídas foram verificadas em emulador: somente o dono altera seus pets; perfis públicos têm uma lista limitada de campos; favoritos, ocorrências e anotações de atendimento são privados; interesses só chegam ao tutor responsável pelo pet; revisões antigas não sobrescrevem atualizações novas.

## Como funciona

### Sem conta

Os cadastros, favoritos e registros ficam no navegador. O site pode ser aberto por `index.html`, e o modo local funciona mesmo se o Firebase não estiver acessível. Limpar os dados do navegador pode removê-los: use o backup JSON.

### Com conta e Firebase protegido

- Login por E-mail/senha ou pelo botão **Entrar com Google**, inclusive Gmail.
- Cadastro por e-mail com nome, senha e confirmação; a conta Google cria o acesso no primeiro login.
- Telas separadas de entrada e cadastro, opção de mostrar/ocultar senha, recuperação de senha e saída da conta.
- Perfis cadastrados na conta publicados no catálogo para outros visitantes.
- Favoritos, interesses, ocorrências e anotações de atendimento sincronizados entre os dispositivos da mesma conta.
- Interesses enviados aos tutores, caixa de recebidos, aceite/recusa, cancelamento e consulta de resposta.
- O salvamento privado, a publicação do pet e os efeitos de interesse são enviados em uma atualização atômica. A interface confirma somente depois do retorno do Firebase.
- Dados de outra conta e formulários anteriores são removidos da tela na troca de usuário.

Os dados locais **não** são enviados automaticamente ao entrar. O botão **Importar meus dados locais para minha conta** explica o que será publicado e exige confirmação. Fotos e a cidade no perfil cadastrado em conta fazem parte do catálogo público. Não inclua contatos pessoais na descrição pública do pet.

O login Google abre uma janela oficial do provedor e permite escolher a conta. Autorize pop-ups do site quando o navegador solicitar. Em navegadores internos de redes sociais, abra o link no navegador do aparelho. O PetMatch informa erros de janela bloqueada, janela fechada, método desabilitado e domínio não autorizado. O site não solicita nem armazena a senha da conta Google. Habilitar o provedor Google e autorizar `perabru.github.io` exige acesso ao console Firebase; adicionar o botão ao código não altera essas configurações do projeto.

Os oito perfis iniciais são exemplos fictícios. Os mascotes da imagem não são anúncios de adoção. Interesses nesses exemplos são anotações e não contatam um tutor real. Ocorrências e registros veterinários permanecem privados e não são encaminhados a autoridades, clínicas ou programas de atendimento.

### Métricas opcionais

Firebase Analytics inicia somente quando o visitante marca a opção de consentimento. Desmarcar desativa a coleta. O aplicativo não envia nomes, mensagens, ocorrências ou anotações de atendimento como eventos de Analytics.

## Recuperação e troca de conta

Se a conta estiver conectada mas os registros ainda não tiverem sido carregados, exportação, importação e exclusão ficam desabilitadas. O site não gera um backup vazio como se fosse uma cópia da conta. A opção **Sair e usar sem conta** volta aos registros locais já existentes.

A sincronização pode ser verificada novamente sem sair da conta. Trocas de usuário durante operações pendentes cancelam o uso dos resultados antigos. Fotos e mensagens opcionais ausentes em registros válidos do Firebase recebem valores padrão para não impedir o carregamento dos perfis.

## Executar em um servidor local

Com Python 3 instalado:

```bash
python iniciar.py
```

No Windows, também é possível abrir `INICIAR_WINDOWS.bat`. O servidor escuta apenas no próprio computador em `http://127.0.0.1:8765/`. Para encerrar, use Ctrl+C.

## Verificação

Foram aprovados testes de interface com duas contas simuladas, funcionamento sem CDN, isolamento entre contas, falhas de permissão e rede, validação de fotos e backup, regras de acesso e integração do serviço com o SDK real do Realtime Database em emulador. O SDK de produção foi consultado apenas para verificar disponibilidade e permissões; esses testes não criaram usuários nem gravaram dados no Firebase de produção.

Consulte `VALIDACAO.md` para o escopo e as limitações da verificação.

Para executar as verificações de autenticação sem acessar o Firebase real, use Node.js 20 ou superior:

```bash
node --test tests/*.mjs
```
