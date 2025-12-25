# GameVault - Cyberpunk Edition

**Sua coleção de jogos, gerenciada com estilo.**

## 📸 Screenshots

*Adicione screenshots aqui*

## 🚀 Funcionalidades

- 📊 Dashboard com analytics e gráficos
- 🎮 Importação automática da Steam
- 👥 Rede social para comparar coleções
- 📱 Totalmente responsivo (mobile-first)
- 🎨 Design Cyberpunk premium
- 📤 Export para JSON/Excel
- 🔍 Filtros avançados

## ⚙️ Configuração

1. Clone o repositório
2. Crie seu arquivo de configuração:
   ```bash
   cp js/config.template.js js/config.js
   ```
3. Edite `js/config.js` e adicione suas API keys:
   - **RAWG**: https://rawg.io/apidocs
   - **Steam**: https://steamcommunity.com/dev/apikey

4. Para Supabase, crie um projeto em https://supabase.com e configure:
   - Edite `js/services/supabase.js` com suas credenciais

5. Sirva com qualquer servidor local (Live Server, etc)

## 🔑 API Keys Necessárias

| Serviço | Propósito | Link |
|---------|-----------|------|
| RAWG | Dados de jogos | https://rawg.io/apidocs |
| Steam | Importação | https://steamcommunity.com/dev/apikey |
| Supabase | Database | https://supabase.com |

## 📄 Licença

Este projeto é protegido pela licença **CC BY-NC-SA 4.0**.
Veja [LICENSE](LICENSE) para detalhes.

## 👤 Autor

**[rauliveira]**

---

⭐ Se gostou, deixe uma estrela!
