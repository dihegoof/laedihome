# Adicionar cronograma de limpeza à Agenda

## Objetivo
Remover os avisos em laranja da aba **Isis** e adicionar, dentro da **Agenda**, um cronograma compartilhado de limpeza dos cômodos, sem alterar o visual ou as funções existentes.

## O que será construído

### Ajuste na Isis
- Remover os dois avisos em laranja sobre acompanhamento médico.
- Manter fórmulas, parâmetros, resultados, validações e histórico exatamente como estão.

### Acesso pela Agenda
- Adicionar um botão **Limpeza** junto aos controles atuais da Agenda.
- O botão abrirá a área de cronograma, com retorno simples aos compromissos.
- Manter compromissos, busca, áudios e lembretes atuais sem alterações.

### Cronograma de limpeza
- Cadastro de cômodo/tarefa, observação opcional, primeira data e horário.
- Repetição configurável por **dias da semana** ou **a cada X dias**.
- Lista ordenada pela próxima limpeza, destacando tarefas de hoje e atrasadas.
- Qualquer membro da casa poderá criar, editar, excluir e marcar uma limpeza como feita.
- Ao concluir, registrar quem fez e quando, calcular a próxima data e manter o histórico compartilhado.

## Dados e segurança
- Criar tabelas próprias para o cronograma e seu histórico, vinculadas à casa atual.
- Aplicar as mesmas permissões compartilhadas e atualização em tempo real usadas nos demais módulos.
- Calcular próximas datas a partir da regra salva, sem tarefas agendadas externas.
- Validar nomes, datas, horários, dias escolhidos e intervalos positivos.

## Verificação
- Conferir criação, edição, exclusão, conclusão e avanço da próxima limpeza nos dois modos de repetição.
- Confirmar visibilidade simultânea entre os membros da casa.
- Verificar que a Agenda e a Isis continuam funcionando e que não há erros no aplicativo.
