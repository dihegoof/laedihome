# Finalizar o Nossa Casa

## Objetivo
Concluir os pedidos pendentes sem remover as funções atuais: finanças por ciclo mensal, uso offline com sincronização, assistente por voz, lembretes e notificações configuradas pelo dono da casa.

## Entregas

### 1. Finanças e fechamento mensal
- Adicionar ao painel ADM a escolha do dia em que o novo ciclo financeiro começa.
- Calcular saldo, entradas, saídas e lançamentos pelo ciclo escolhido, sem apagar dados.
- Manter acesso simples ao mês atual e aos dois ciclos anteriores.
- Preservar edição de dívidas e o módulo de metas já implementados, corrigindo qualquer falha encontrada.

### 2. Agenda e lembretes
- Mostrar uma faixa vermelha para compromissos de hoje ou amanhã criados pelo usuário atual.
- Permitir marcar “Lembrei”, removendo o aviso sem excluir o compromisso.
- Adicionar no painel ADM as opções de antecedência e horário das notificações.
- Enviar notificações somente aos dispositivos do usuário que criou o compromisso.

### 3. Notificações no celular
- Finalizar a integração Firebase já conectada.
- Criar cadastro seguro de cada aparelho e controles para ativar/desativar notificações.
- Criar o processo automático que verifica compromissos e envia avisos no horário configurado.
- Transformar o site em aplicativo instalável. No iPhone, explicar na própria tela que notificações exigem “Adicionar à Tela de Início”; no Android e computador, usar a permissão normal do navegador.

### 4. Assistente por voz
- Colocar apenas os ícones de convite e microfone no topo para todos os membros.
- Permitir que cada pessoa escolha se o assistente fica ativo enquanto o aplicativo está aberto.
- Ouvir comandos, mostrar o que foi entendido e pedir confirmação antes de alterar despensa, finanças, agenda, dívidas ou metas.
- Executar as ações usando as mesmas regras e dados compartilhados das telas manuais.
- Informar claramente quando o navegador bloquear o microfone ou quando o aplicativo estiver em segundo plano; navegadores não permitem escuta contínua com o app fechado.

### 5. Uso offline e sincronização
- Adicionar instalação como aplicativo e cache das telas principais.
- Manter uma cópia local dos dados já carregados para consulta sem internet.
- Guardar alterações feitas offline em uma fila e enviá-las ao voltar a conexão, evitando duplicações.
- Exibir estado offline, quantidade de alterações pendentes e confirmação após sincronizar.
- Manter fotos e áudios como ações que exigem conexão, evitando uploads incompletos ou perda de arquivos grandes.

## Dados e segurança
- Ampliar as configurações da casa com dia do ciclo e preferências de aviso.
- Criar registros protegidos de aparelhos, acessíveis pelo próprio usuário e pelo serviço de envio.
- Criar identificadores únicos nas alterações que podem ser repetidas após ficar offline.
- Validar no banco que apenas o dono da casa altera as configurações gerais de finanças e notificações.
- Manter os dados isolados por casa e nunca expor chaves de envio no navegador.

## Validação
- Testar proprietário e membro comum, incluindo permissões do painel ADM.
- Testar ciclos mensais em dias 1, 15 e 31 e a navegação dos dois meses anteriores.
- Testar criação offline, reconexão e ausência de registros duplicados.
- Testar lembrete “Hoje/Amanhã”, botão “Lembrei”, comando de voz e notificações em modo instalável.
- Conferir celular e desktop, erros visuais, console e compilação final.
