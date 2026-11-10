# WhatsApp automático — gateway gratuito (Render)

Este é o servidor que mantém o WhatsApp de cada studio conectado (como o WhatsApp Web)
e envia as confirmações e os lembretes. Ele é leve (Baileys, sem banco próprio) e guarda
a sessão no Supabase, então pode reiniciar ou dormir sem desconectar ninguém.

## Por que não na Vercel?

A Vercel roda funções que ligam, respondem e desligam em segundos. O WhatsApp precisa de
uma conexão aberta o tempo todo, então não funciona lá. O site em si pode ficar na Vercel
normalmente; só este gateway precisa de um servidor que fique ligado.

## Opção recomendada: Render (grátis)

O plano grátis do Render dorme após 15 minutos sem receber visitas. O Supabase já chama
o gateway a cada minuto (junto com o envio da fila), então ele não dorme. Um serviço ligado
o mês inteiro usa ~720 das 750 horas grátis por mês — dá certo com **um** serviço só nessa conta.

1. Envie este projeto para o GitHub (repositório `date-nails`).
2. Crie conta em https://render.com e clique em **New › Blueprint**, escolha o repositório.
   O arquivo `render.yaml` já configura tudo (pasta `whatsapp-gateway`, plano free).
3. Quando pedir, preencha `SUPABASE_SERVICE_ROLE_KEY`
   (Supabase › Project Settings › API › `service_role` — **nunca** coloque essa chave no site).
4. Depois do deploy, copie:
   - o endereço do serviço, ex.: `https://date-nails-whatsapp.onrender.com`
   - o valor gerado de `API_KEY` (Render › serviço › Environment)
5. No Supabase › Edge Functions › Secrets, crie:

| Nome | Valor |
|---|---|
| `EVOLUTION_URL` | o endereço do Render |
| `EVOLUTION_API_KEY` | o `API_KEY` do Render |

6. No painel do Date Nails › WhatsApp › **Conectar WhatsApp**, leia o QR Code com o celular do studio.

Limites do grátis: 512 MB de memória (atende vários studios pequenos), e se o Render
reiniciar o serviço, ele volta e reconecta sozinho em cerca de 1 minuto. Quando tiver mais
clientes pagando, o plano Starter do Render (US$ 7/mês) não dorme e tem mais folga.

## Outras opções gratuitas

- **Oracle Cloud Always Free** (sempre ligado de verdade, mais trabalho para configurar):
  crie uma VM Ubuntu, instale Docker e rode
  `docker build -t dn-wa . && docker run -d --restart=always -p 80:8080 -e API_KEY=... -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... dn-wa`
  (coloque HTTPS com Caddy, como no guia da pasta `servidor-whatsapp`).
- **Koyeb** (1 serviço grátis, dorme após 1 hora sem visitas — o ping do Supabase também o mantém acordado).

## Rotas (compatíveis com a Evolution API)

Todas pedem o header `apikey: <API_KEY>`, menos `/health`.

| Método | Rota | O que faz |
|---|---|---|
| GET | `/health` | Está vivo? |
| POST | `/instance/create` `{instanceName}` | Cria a sessão e devolve o QR Code |
| GET | `/instance/connect/:nome` | QR Code atualizado |
| GET | `/instance/connectionState/:nome` | `open` / `connecting` / `close` |
| DELETE | `/instance/logout/:nome` | Desconecta e apaga a sessão |
| POST | `/message/sendText/:nome` `{number, text}` | Envia mensagem |

> Esta conexão não é a API oficial do WhatsApp. Use para confirmações e lembretes de clientes
> reais; evite disparos em massa, que podem bloquear o número.
