# Date Nails — agenda digital por assinatura

Sistema de agendamento online para studios de beleza (SaaS).
Cada studio cria a própria conta, personaliza a página e paga a assinatura pelo PicPay.

## Pastas

| Pasta | O que é |
|---|---|
| `site/` | O site inteiro (HTML/CSS/JS). É isso que vai para o FTP. |
| `supabase/migrations/` | Estrutura do banco (já aplicada no projeto **agendafacil**). |
| `supabase/functions/` | Funções de servidor (já publicadas): WhatsApp e PicPay. |
| `whatsapp-gateway/` | Servidor do WhatsApp automático (leve, grátis no Render). |
| `servidor-whatsapp/` | Alternativa: Evolution API em servidor próprio (Oracle Cloud/VPS). |

## Endereços do site

| Endereço | Para quem |
|---|---|
| `/` | Página de vendas do Date Nails |
| `/painel/` | Dona do studio: cadastro, login e painel (instale no celular: "Adicionar à tela inicial") |
| `/nome-do-studio` | Página de agendamento do studio (precisa do `.htaccess`, Apache) |
| `/agendar/?s=nome-do-studio` | Mesmo endereço, funciona em qualquer hospedagem |
| `/minha-agenda/?s=nome-do-studio` | Área da cliente (nome + WhatsApp, ou link enviado no WhatsApp) |
| `/saas/` | Você, dono da plataforma: studios, preço, teste grátis, liberar dias |

## Publicar (FTP)

1. Envie **o conteúdo da pasta `site/`** para `public_html` (inclui o arquivo oculto `.htaccess`).
2. O `config.js` já aponta para o Supabase. Nada mais a configurar no FTP.

## Primeiros passos (uma vez só)

1. **Supabase › Authentication › Sign In / Providers**: deixe "Allow new users to sign up" **ligado**
   (as donas de studio se cadastram sozinhas). Em *URL Configuration*, coloque o endereço do site
   em **Site URL** e adicione `https://seusite.com.br/painel/` em **Redirect URLs**.
2. Crie sua conta em `seusite.com.br/painel/?cadastro` e depois rode no **SQL Editor**:
   ```sql
   insert into public.dn_superadmins (user_id)
   select id from auth.users where email = 'SEU-EMAIL@AQUI.com';
   ```
3. Abra `seusite.com.br/saas/`, confira **Endereço do site** e o **preço** e clique em Salvar.
   O endereço do site é usado nos links que vão no WhatsApp.

## WhatsApp automático (grátis)

Veja `whatsapp-gateway/LEIA-ME.md`. Resumo: publicar o gateway no Render (grátis, pelo `render.yaml`)
e criar dois segredos no Supabase: `EVOLUTION_URL` e `EVOLUTION_API_KEY`.
A Vercel serve para o site, mas não para o WhatsApp (precisa de conexão aberta 24h).
Enquanto não estiver configurado, o painel continua funcionando com os botões de WhatsApp manuais.

## PicPay (assinatura)

1. Crie conta no **PicPay Empresas** e ative o **E-commerce / Checkout**.
2. No painel do PicPay pegue o **x-picpay-token** e o **x-seller-token**.
3. Supabase › Edge Functions › Secrets: crie `PICPAY_TOKEN` e `PICPAY_SELLER_TOKEN`.
4. No painel do PicPay, configure a URL de notificação:
   `https://ahtvsvysijmfqwfeuvrc.supabase.co/functions/v1/billing?action=webhook`

Cada pagamento libera 30 dias, somados ao período atual. Se o PicPay da sua conta usar a API nova
(OAuth com client_id/client_secret), a troca fica concentrada em `supabase/functions/billing/index.ts`.
Enquanto o PicPay não estiver ligado, você libera dias manualmente em `/saas/` (botão "+30 dias").

## Regras de negócio implementadas

- Teste grátis (padrão 7 dias) e plano mensal (padrão R$ 39,90), editáveis em `/saas/`.
- Assinatura vencida: a página do studio pausa para as clientes, o painel mostra a tela de assinatura; os dados ficam guardados.
- Agendamento sem conflito de horário (trava no banco), respeitando horário de funcionamento, pausa, folgas, antecedência mínima e janela máxima.
- Confirmação automática no WhatsApp ao agendar (com link da área da cliente) e lembrete X minutos antes.
- Cancelou/faltou → lembrete cancelado. Remarcou → lembrete reagendado.
- Passou o horário de término sem cancelamento ou falta → o agendamento vira **concluído** sozinho (verificação a cada 5 min) e o valor entra no financeiro. A dona só informa a forma de pagamento; se a cliente não veio, marca "Faltou" e a entrada sai do financeiro.
- Concluir manualmente também lança a entrada; desfazer remove; mudar valor ou forma de pagamento atualiza o lançamento.
- Área da cliente: nome + WhatsApp (ou link seguro), com cancelamento online até X horas antes (definido pela dona).
- Cada studio só enxerga os próprios dados (Row Level Security no banco).
