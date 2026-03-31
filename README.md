# Sistema de Gestão de Demandas

Sistema web para gestão de projetos e planos de trabalho, com controle de acesso por papel (MASTER / PADRÃO), semáforo de prazos, histórico de atendimento e exportação de relatórios.

## Stack

- **Frontend:** HTML5 + Tailwind CSS + Vue 3 (via CDN) + Vanilla JS
- **Backend:** Vercel Serverless Functions (Node.js)
- **Banco de dados:** Vercel Postgres
- **Autenticação:** JWT em cookie `httpOnly`
- **Hospedagem:** Vercel

---

## Deploy passo a passo

### 1. Suba o projeto no GitHub

```bash
git init
git add .
git commit -m "feat: sistema de gestão de demandas v1"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/gestao-demandas.git
git push -u origin main
```

### 2. Conecte ao Vercel

1. Acesse [vercel.com](https://vercel.com) e clique em **Add New > Project**
2. Importe o repositório do GitHub
3. Deixe as configurações padrão — o Vercel detecta automaticamente
4. Clique em **Deploy**

### 3. Crie o banco de dados

1. No dashboard do Vercel, vá em **Storage > Create Database > Postgres**
2. Dê um nome (ex: `gestao-demandas-db`) e clique em **Create**
3. O Vercel injeta `POSTGRES_URL` automaticamente nas variáveis de ambiente

### 4. Execute o schema SQL

1. No dashboard do banco, clique na aba **Query**
2. Cole todo o conteúdo do arquivo `schema.sql`
3. Clique em **Run Query**

Isso cria as tabelas e insere o usuário administrador inicial.

### 5. Configure as variáveis de ambiente

No Vercel, vá em **Settings > Environment Variables** e adicione:

| Variável | Valor |
|---|---|
| `JWT_SECRET` | Uma string aleatória longa (ex: `minha-chave-super-secreta-2026`) |
| `POSTGRES_URL` | Já preenchida automaticamente pelo banco |

Após adicionar, faça um novo deploy clicando em **Redeploy**.

---

## Primeiro acesso

```
URL: https://seu-projeto.vercel.app/login.html
Email: admin@sistema.com
Senha: admin123
```

> ⚠️ **Troque a senha imediatamente após o primeiro login!**
> Vá em Usuários > edite o administrador.

---

## Estrutura de arquivos

```
/
├── api/
│   ├── auth/
│   │   ├── login.js        ← POST /api/auth/login
│   │   └── me.js           ← GET /api/auth/me | DELETE (logout)
│   ├── middleware/
│   │   ├── auth.js         ← verificação JWT
│   │   └── db.js           ← conexão Postgres
│   ├── projetos/
│   │   ├── index.js        ← GET lista | POST criar
│   │   ├── [id].js         ← GET detalhe | PATCH atualizar | DELETE
│   │   └── historico.js    ← GET | POST comentários
│   ├── relatorios/
│   │   └── index.js        ← GET relatório | ?exportar=csv
│   └── usuarios/
│       ├── index.js        ← GET lista | POST criar (master)
│       └── [id].js         ← PATCH | DELETE (master)
├── public/
│   ├── js/
│   │   └── api.js          ← cliente centralizado de API
│   ├── index.html          ← Dashboard
│   ├── login.html          ← Login
│   ├── projetos.html       ← Lista de projetos
│   ├── projeto-detalhe.html← Detalhe + edição + histórico
│   ├── usuarios.html       ← Gestão de usuários (master)
│   └── relatorios.html     ← Relatórios + exportação CSV
├── schema.sql              ← Script de criação do banco
├── package.json
├── vercel.json
└── README.md
```

---

## Papéis de acesso

| Papel | Acesso |
|---|---|
| **MASTER** | Todos os projetos, gestão de usuários, relatórios completos |
| **PADRÃO** | Apenas projetos onde é analista ou gestor |

Um mesmo usuário pode ser analista em um projeto e gestor em outro.

---

## Semáforo de prazos

| Cor | Dias úteis restantes |
|---|---|
| 🟢 Verde | 5 ou mais |
| 🟡 Amarelo | 2 a 4 |
| 🔴 Vermelho | 1 |
| ⬛ Preto | Vencido (número negativo = dias de atraso) |

O semáforo **congela** quando a Data de Saída Diretoria é preenchida.

---

## Fluxo de status

```
EM_ANALISE → GFCAP → OSC → FINALIZADO
```

Cada tramitação é registrada automaticamente no histórico.

---

## Exportação de relatórios

Acesse `/relatorios.html`, aplique os filtros desejados e clique em **Exportar CSV**.
O arquivo gerado é compatível com Excel (codificação UTF-8 com BOM).
