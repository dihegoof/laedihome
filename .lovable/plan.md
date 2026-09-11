# Corrigir o build sem perder as atualizações

## O que será feito
- Remover a configuração de publicação estática do GitHub Pages que interrompe a geração da tela inicial.
- Manter intactas as últimas melhorias de Finanças: extrato mensal, edição de dívidas e metas.
- Corrigir pequenos pontos inseguros encontrados no código atualizado.
- Validar a abertura do app e o build completo antes de concluir.

## Detalhes técnicos
- Restaurar a configuração padrão do TanStack Start usada pela hospedagem do Lovable.
- Não adicionar modo offline nesta correção; o arquivo enviado não chegou a instalar um PWA no app.
- Confirmar tipos, build e tela inicial autenticada no preview.
