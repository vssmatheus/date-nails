# Servidor de WhatsApp (gratuito) — Evolution API

O Date Nails envia as confirmações e os lembretes pelo **WhatsApp do próprio studio**.
Para isso, um pequeno servidor fica ligado 24h com a Evolution API (software livre),
que conecta o WhatsApp lendo um QR Code, igual ao WhatsApp Web.

> Atenção: essa forma de conexão **não é a API oficial** do WhatsApp. Funciona bem para
> confirmações e lembretes de clientes reais, mas evite disparos em massa (marketing),
> que podem levar o número a ser bloqueado. Um único servidor atende **todos os studios**.

## Opção grátis: Oracle Cloud "Always Free"

1. Crie conta em https://www.oracle.com/br/cloud/free/ (pede cartão só para verificação).
2. Crie uma instância **VM.Standard.A1.Flex** (Ampere) com Ubuntu 22.04 — 1 OCPU e 6 GB já sobram.
3. Em *Virtual Cloud Network > Security List*, libere as portas **80** e **443** (TCP).
4. No seu provedor de domínio, crie um registro **A**: `wa.seudominio.com.br` → IP público da VM.
5. Acesse a VM por SSH e rode:

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT && sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true
mkdir date-nails-wa && cd date-nails-wa
# envie para cá os arquivos docker-compose.yml e env.exemplo desta pasta
cp env.exemplo .env && nano .env      # preencha domínio e senhas
sudo docker compose up -d
```

6. Teste: abra `https://wa.seudominio.com.br` — deve aparecer uma mensagem da Evolution API.

(Também funciona em qualquer VPS barata — Hostinger, Contabo, Hetzner — com os mesmos comandos.)

## Ligar ao Supabase

No Supabase: **Edge Functions › Secrets** (ou *Project Settings › Edge Functions*), crie:

| Nome | Valor |
|---|---|
| `EVOLUTION_URL` | `https://wa.seudominio.com.br` |
| `EVOLUTION_API_KEY` | o mesmo `API_KEY` do arquivo `.env` |

Pronto. Cada dona de studio entra em **Painel › WhatsApp › Conectar WhatsApp** e lê o QR Code
com o celular do studio. A partir daí:

- assim que a cliente agenda → confirmação com o link do agendamento;
- X minutos antes do horário (ela escolhe: 30 min, 1h, 2h, 3h ou 1 dia) → lembrete;
- se a cliente cancelar ou faltar, o lembrete é cancelado; se remarcar, ele é reagendado.

A fila roda a cada minuto (pg_cron no Supabase chama a função `whatsapp-dispatch`).

## Se um dia quiser a API oficial da Meta

A troca fica só na função `supabase/functions/whatsapp-dispatch/index.ts` (o trecho do `fetch`).
O resto do sistema (fila, horários, textos, cancelamentos) continua igual.
