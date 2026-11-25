# CF | Dashboard financeiro para lojas

Aplicação local para gerenciar produtos, estoque, pedidos e resultados financeiros de lojas. A loja pública e o painel usam o mesmo SQLite; cada cadastro cria um espaço independente.

## Executar em localhost

- Requer Node.js 22.13 ou superior.
- Na pasta do projeto, execute `npm start`.
- Abra `http://localhost:3001`.
- O banco de dados ativo é `database/CF.sqlite`.

O servidor inicializa e atualiza o esquema SQLite automaticamente, preservando os produtos, usuários e pedidos já existentes. Os registros antigos são associados à loja CF; custos que não foram registrados anteriormente permanecem desconhecidos.

## Conta de demonstração

- E-mail: `pedro@gmail.com`
- Usuário: `teste`
- Senha: `12345678`
- Vitrine padrão: `http://localhost:3001/` (Loja Tech do Pedro)
- Loja CF existente: `http://localhost:3001/?loja=cf-eletronicos`

A loja de demonstração é preenchida automaticamente com produtos, custos unitários, pedidos em diferentes datas e despesas. Os dados servem para demonstrar o dashboard e não representam pagamentos reais. Troque/remova essas credenciais antes de qualquer implantação pública.

## Cadastrar uma loja

Acesse `http://localhost:3001/cadastro` e informe nome da loja, nome do responsável, usuário, e-mail e senha. O cadastro cria uma loja independente e leva ao painel. Cadastre produtos e seus custos; o link da vitrine aparece na área **Conta**. A loja pública recebe compras em `/?loja=<identificador-da-loja>`.

O login aceita e-mail ou usuário. A aba **Conta** permite atualizar o nome, carregar uma foto PNG/JPG/WebP de até 1 MB e sair da sessão.

## Cadastro do cliente na simulação

O cliente pode criar uma conta dedicada em `http://localhost:3001/cliente/cadastro` e entrar em `http://localhost:3001/cliente/login`.
O cadastro utiliza nome, e-mail, telefone e senha, mantém uma sessão separada da conta administrativa e pode ser associado a uma loja específica.

Antes de criar um pedido, o cliente informa nome, e-mail e telefone no carrinho. Esses dados são salvos no pedido e preenchidos automaticamente quando o cliente está conectado. O cadastro é demonstrativo e não coleta dados reais de pagamento.

## Financeiro

- A receita considera somente pedidos marcados como pagos ou enviados; pedidos pendentes e cancelados não entram nas vendas.
- O custo do produto é copiado para cada item no momento da compra para preservar o histórico, mesmo que o custo atual do cadastro mude depois.
- O lucro operacional estimado subtrai custos dos produtos vendidos e despesas registradas no período selecionado.
- Para evitar apresentar lucro incorreto, o dashboard sinaliza quando vendas antigas não têm custo cadastrado. Impostos, taxas de pagamento e outras despesas não lançadas não são calculados.
- As compras feitas pela vitrine ficam pendentes até serem atualizadas no painel. O sistema não integra pagamentos reais.

## Banco e organização

- `stores`: lojas e identificadores públicos.
- `users`: contas, usuário de login, foto e vínculo com a loja.
- `products`: preço de venda, custo unitário e estoque.
- `orders` e `order_items`: vendas, quantidades e custos/preços congelados na compra.
- `expenses`: despesas operacionais por loja e data.

As páginas administrativas filtram os dados pela loja autenticada. O SQLite local não exige token nem serviço externo.

## Pastas

- `pages/`: vitrine, login, cadastro e painel.
- `css/`: estilos responsivos e modo escuro.
- `js/`: vitrine, autenticação e dashboard.
- `server/`: API HTTP, validação e regras de negócio.
- `database/`: esquema SQLite e banco ativo.
