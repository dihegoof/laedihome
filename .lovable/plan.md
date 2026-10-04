# Finalizar alertas de lavagem

## Objetivo
Enviar alertas reais pelo Firebase para as lavagens próximas, com parâmetros definidos pelo dono no painel ADM, sem alterar outras abas.

## Implementação
- Adicionar às configurações da casa controles próprios para alertas de lavagem: ativar/desativar, antecedência e horário.
- Registrar em cada lavagem qual ocorrência já foi notificada, evitando alertas duplicados e liberando o próximo alerta após conclusão ou edição.
- Estender o envio autenticado pelo Firebase para localizar lavagens próximas da casa, avisar os aparelhos habilitados e remover tokens inválidos.
- Manter os alertas de compromissos existentes independentes dos alertas de lavagem.
- Adicionar na tela de Limpeza uma área de alertas para ativar notificações no aparelho e mostrar a próxima lavagem pendente.
- Acionar a verificação periódica junto da verificação de compromissos já existente.

## Dados e segurança
- As configurações continuam editáveis somente pelo dono e visíveis aos membros da casa.
- O envio usa apenas aparelhos vinculados à mesma casa do usuário autenticado.
- Nenhuma credencial do Firebase será exposta no navegador.

## Verificação
- Confirmar tipos e build sem erros.
- Conferir que salvar/editar/concluir uma lavagem reinicia corretamente o ciclo de notificação.
- Preservar navegação, finanças, Isis e demais abas sem mudanças.
