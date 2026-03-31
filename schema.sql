-- ============================================================
-- SISTEMA DE GESTÃO DE DEMANDAS
-- Schema SQL — Vercel Postgres
-- Execute no painel: Vercel > Storage > seu-banco > Query
-- ============================================================

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS usuarios (
  id           SERIAL PRIMARY KEY,
  nome         VARCHAR(100) NOT NULL,
  email        VARCHAR(100) UNIQUE NOT NULL,
  senha        VARCHAR(255) NOT NULL,
  is_master    BOOLEAN DEFAULT FALSE,
  ativo        BOOLEAN DEFAULT TRUE,
  criado_em    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de projetos
CREATE TABLE IF NOT EXISTS projetos (
  id                      SERIAL PRIMARY KEY,
  codigo                  VARCHAR(20) UNIQUE NOT NULL, -- ex: GFARP20260001
  tipo_demanda            VARCHAR(100) NOT NULL,
  osc_nome                VARCHAR(200) NOT NULL,
  descricao               TEXT,
  status                  VARCHAR(30) NOT NULL DEFAULT 'EM_ANALISE'
                          CHECK (status IN ('EM_ANALISE','GFCAP','OSC','FINALIZADO')),
  data_recebimento        DATE NOT NULL,
  data_distribuicao       DATE,
  prazo_dias              INT NOT NULL DEFAULT 7,
  data_prevista           DATE,     -- calculado: data_distribuicao + prazo_dias úteis
  data_pausa              DATE,
  motivo_pausa            TEXT,
  data_retomada           DATE,
  novo_prazo              DATE,     -- recalculado após pausa
  principais_apontamentos TEXT,
  data_saida_diretoria    DATE,
  observacoes_gerencia    TEXT,
  gestor_id               INT REFERENCES usuarios(id),
  analista_id             INT REFERENCES usuarios(id),
  criado_em               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de histórico de atendimento (comentários/pausas)
CREATE TABLE IF NOT EXISTS historico_atendimento (
  id             SERIAL PRIMARY KEY,
  projeto_id     INT NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  usuario_id     INT NOT NULL REFERENCES usuarios(id),
  tipo           VARCHAR(20) NOT NULL DEFAULT 'comentario'
                 CHECK (tipo IN ('comentario', 'pausa', 'retomada', 'apontamento')),
  texto          TEXT NOT NULL,
  criado_em      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de histórico de tramitação (mudanças de status)
CREATE TABLE IF NOT EXISTS historico_tramitacao (
  id               SERIAL PRIMARY KEY,
  projeto_id       INT NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  usuario_id       INT REFERENCES usuarios(id),
  status_anterior  VARCHAR(30),
  status_novo      VARCHAR(30),
  criado_em        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── ÍNDICES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projetos_gestor    ON projetos(gestor_id);
CREATE INDEX IF NOT EXISTS idx_projetos_analista  ON projetos(analista_id);
CREATE INDEX IF NOT EXISTS idx_projetos_status    ON projetos(status);
CREATE INDEX IF NOT EXISTS idx_hist_at_projeto    ON historico_atendimento(projeto_id);
CREATE INDEX IF NOT EXISTS idx_hist_tr_projeto    ON historico_tramitacao(projeto_id);

-- ── USUÁRIO MASTER INICIAL ───────────────────────────────────
-- Senha: admin123 (bcrypt hash)
-- TROQUE A SENHA no primeiro login!
INSERT INTO usuarios (nome, email, senha, is_master)
VALUES (
  'Administrador',
  'admin@sistema.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh7y',
  TRUE
) ON CONFLICT (email) DO NOTHING;
