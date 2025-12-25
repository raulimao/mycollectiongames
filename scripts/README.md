# GOG Galaxy Extractor - README

## 📋 Descrição

Script Python para extrair sua biblioteca de jogos completa do GOG Galaxy 2.0, incluindo jogos de **todas as plataformas** conectadas (Steam, GOG, Epic, Xbox, PlayStation, etc.).

## 🎯 O Que Faz

Este script:
1. ✅ Lê obancodedadoslocalGOG Galaxy 2.0
2. ✅ Extrai  jogos de **todas as plataformas** conectadas
3. ✅ Exporta em formato compatível com GameVault (JSON e CSV)
4. ✅ Mantém informações de plataforma e tags

## 📦 Requisitos

- **Python 3.6+**
- **GOG Galaxy 2.0** instalado e configurado
- Plataformas conectadas no GOG Galaxy

## 🚀 Como Usar

### 1. Executar o Script

```bash
cd "c:\Users\rauli\Downloads\Programas\Collection Games\scripts"
python extract_gog_galaxy.py
```

### 2. Verificar Output

O script irá:
- Mostrar quantos jogos foram encontrados
- Exibir distribuição por plataforma
- Salvar arquivos na pasta `exports/`

**Arquivos gerados:**
- `exports/gog_games_YYYYMMDD_HHMMSS.json` - Formato JSON
- `exports/gog_games_YYYYMMDD_HHMMSS.csv` - Formato CSV

### 3. Importar no GameVault

1. Abra o GameVault no navegador
2. Clique no botão **Importar** (ícone de nuvem)
3. Selecione **"Arquivo JSON/CSV (GOG Galaxy, etc.)"**
4. Arraste o arquivo `.json` ou `.csv` gerado
5. Clique em **"IMPORTAR BIBLIOTECA"**

## 📊 Plataformas Suportadas

O script detecta automaticamente jogos de:

| Plataforma | ID GOG | Convertido para |
|------------|--------|-----------------|
| Steam | `steam` | Steam |
| GOG | `gog` | GOG |
| Epic Games | `epic` | Epic Games |
| Origin | `origin` | Origin |
| Ubisoft Connect | `uplay` | Ubisoft Connect |
| Battle.net | `battlenet` | Battle.net |
| Xbox | `xbox` | Xbox |
| PlayStation | `psn` | PlayStation |
| Nintendo | `nintendo` | Nintendo |
| Outros | `generic` | PC |

## 📁 Localização do Banco de Dados

O script procura o banco automaticamente em:
```
C:\ProgramData\GOG.com\Galaxy\storage\galaxy-2.0.db
```

## 🔒 Segurança

- O script **apenas lê** o banco de dados (read-only)
- Nenhuma modificação é feita no GOG Galaxy
- Dados exportados são salvos localmente
- API Keys não são necessárias

## ⚠️ Troubleshooting

### Erro: "GOG Galaxy database não encontrado"

**Solução:**
1. Certifique-se que o GOG Galaxy 2.0 está instalado
2. Execute o GOG Galaxy pelo menos uma vez
3. Verifique permissões da pasta `C:\ProgramData\`

### Erro: "Permission denied"

**Solução:**
Execute o prompt de comando como **Administrador**

### Nenhum jogo encontrado

**Verificar:**
1. Plataformas estão conectadas no GOG Galaxy?
2. Sincronização foi concluída?
3. GOG Galaxy está atualizado?

## 📝 Formato dos Arquivos

### JSON
```json
[
  {
    "title": "Cyberpunk 2077",
    "platform": "GOG",
    "status": "Coleção",
    "tags": ["Digital", "GOG"]
  }
]
```

### CSV
```csv
title,platform,status,tags
Cyberpunk 2077,GOG,Coleção,Digital,GOG
```

## 🔄 Atualização

Para atualizar sua biblioteca:
1. Execute o script novamente
2. Importe o novo arquivo no GameVault
3. O sistema detecta duplicatas automaticamente
4. Apenas novos jogos serão adicionados

## 💡 Dicas

- **Primeira vez**: Execute após sincronizar todas as plataformas no GOG Galaxy
- **Frequência**: Execute sempre que adicionar novos jogos
- **Backup**: Os arquivos exportados são ótimos backups da sua biblioteca

## 🆘 Suporte

Se encontrar problemas:
1. Verifique se o GOG Galaxy está fechado
2. Execute como Administrador
3. Confira se o caminho do banco está correto
4. Veja logs de erro no console

---

**Desenvolvido para GameVault** 🎮
