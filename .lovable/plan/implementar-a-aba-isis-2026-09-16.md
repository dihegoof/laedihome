# Implementar a aba Isis

## Objetivo
Adicionar ao menu inferior a aba **Isis**, preservando integralmente o visual e a navegação atuais. A área terá cadastro de alimentos, montagem de refeição, cálculo determinístico de carboidratos e insulina, parâmetros configuráveis e histórico compartilhado — sem IA no cálculo.

## O que será construído

### Banco de alimentos
- Cadastro compartilhado pela casa com nome, categoria, carboidratos por 100 g, marca, observações, imagem e estado ativo/inativo.
- Pesquisa por nome, marca ou categoria.
- Edição, ativação/desativação e exclusão.
- Categorias livres para permitir vários alimentos e marcas na mesma categoria.

### Calculadora de refeição
- Seleção de vários alimentos e entrada de peso decimal em gramas.
- Cálculo por item: `peso × carboidratos por 100 g ÷ 100`.
- Alteração de quantidade, remoção de itens e total da refeição em tempo real.
- Entrada validada da glicemia atual.
- Detalhamento de insulina da refeição, correção, dose calculada e dose ajustada.
- Aviso de segurança visível antes do salvamento.

### Parâmetros
- Configuração única para toda a casa: relação insulina/carboidrato, glicemia alvo, fator de correção e incremento de dose.
- Apenas o dono da casa poderá editar esses valores, dentro do painel existente.
- O cálculo bruto ficará separado do arredondamento e ambos serão apresentados claramente.

### Histórico
- Salvamento da refeição e dos itens com cópias dos nomes, pesos e valores usados naquele momento.
- Lista compartilhada por toda a casa, com data, glicemia, totais e autor.
- Visualização detalhada de cada refeição anterior, incluindo parâmetros e memória completa do cálculo.

## Segurança e dados
- Novas tabelas protegidas por casa, seguindo as regras de acesso atuais.
- Validação no aplicativo e no banco para impedir valores negativos, ausentes ou parâmetros inválidos.
- Operações monetárias não serão envolvidas; cálculos decimais usarão precisão controlada para evitar erros de ponto flutuante.
- Nenhuma IA ou API externa participará do cadastro normal, cálculo ou arredondamento.
- A estrutura deixará espaço para uma futura sugestão opcional de cadastro, sempre exigindo confirmação humana e sem afetar o cálculo.

## Integração visual
- Nova aba **Isis** no mesmo menu inferior, com o mesmo padrão de ícone, espaçamento, cores e estados das abas atuais.
- Tela mobile-first usando os componentes, campos, cartões, modais, tipografia e temas já existentes.
- As abas e funções atuais permanecerão inalteradas.

## Verificação
- Conferir cadastro, edição, exclusão, pesquisa, cálculo com decimais, arredondamentos permitidos e histórico imutável.
- Verificar permissões do dono e compartilhamento entre membros da casa.
- Validar o aplicativo em celular e desktop e confirmar que as telas existentes continuam funcionando.
