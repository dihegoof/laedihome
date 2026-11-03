# Fotos reais nos alimentos e produtos + ideias de melhorias

## 1. Foto real automática (foco: Isis)
- No cadastro/edição de alimento (Isis) e de produto (Despensa), novo botão **"Buscar foto na internet"**.
- O app procura pelo nome (e marca, se tiver) e mostra de 4 a 6 fotos para escolher com um toque; a escolhida é salva no app (não depende do site original continuar no ar).
- Botão **"Buscar fotos para todos sem foto"**: percorre os itens sem imagem e sugere uma foto para cada, com tela de confirmação rápida (aceitar / trocar / pular).
- Sem IA: usa primeiro o catálogo gratuito Open Food Facts (ótimo para produtos de mercado brasileiros com marca) e, se não achar, uma busca de imagens na web.

## 2. Modo visual da Isis (para quem ainda não lê bem)
- Alimentos em **grade de fotos grandes** com toque para adicionar à refeição.
- Peso escolhido com botões grandes (+10 g, +50 g, −10 g) além do campo numérico.
- Resultado com número da dose bem grande e o aviso fixo "Mostre para um adulto antes de aplicar".
- Fotos também no histórico de refeições.
- Cálculo continua 100% igual, sem IA.

## 3. Ideias para implementarmos depois (escolha as que quiser)
- **Lista de compras automática**: itens da Despensa abaixo de um mínimo e ingredientes do cardápio da semana que faltam viram uma lista compartilhada para marcar no mercado.
- **Refeições favoritas da Isis**: salvar "Café com pão e leite" e repetir com um toque, só ajustando peso.
- **Gráfico de glicemia** semanal/mensal no histórico da Isis para levar ao médico (exportar PDF).
- **Validade dos produtos** com aviso no celular antes de vencer.
- **Contas fixas do mês** (luz, água, internet) com lembrete de vencimento nas Finanças.
- **Cargas**: resumo do dia (quantas faturadas, pendentes, com erro) no topo e cópia rápida do DT/placa com um toque.
- **Tela inicial "Hoje"**: compromissos, refeição do cardápio, limpeza do dia e cargas pendentes num só lugar.

## Detalhes técnicos
- Server function autenticada `searchProductImages(query)`: consulta Open Food Facts (`/cgi/search.pl`, sem chave); fallback via conector Firecrawl search (imagens), credenciais só no servidor.
- `importImageFromUrl(url)`: baixa no servidor, valida tipo/tamanho, envia ao bucket existente (`food-images` / `product-images`) no caminho da casa e retorna o path salvo em `image_url`.
- Novo componente `ImagePicker` reutilizado em IsisScreen e InventoryScreen; visual atual preservado.
- Modo visual é uma opção de layout dentro da aba Isis (alternância lista/fotos), sem mudar a navegação.
