// Steam Import Helper Functions

const setupValidationListeners = () => {
    const apiKeyInput = document.getElementById('steamApiKey');
    const steamIdInput = document.getElementById('steamId');

    if (apiKeyInput) {
        apiKeyInput.addEventListener('input', (e) => {
            validateApiKey(e.target.value);
        });
    }

    if (steamIdInput) {
        steamIdInput.addEventListener('input', (e) => {
            validateSteamId(e.target.value);
        });
    }
};

const validateApiKey = (value) => {
    const icon = document.getElementById('apiKeyValidation');
    if (!icon) return;

    if (!value) {
        icon.style.display = 'none';
        return;
    }

    // Steam API keys are 32 character hexadecimal strings
    const isValid = /^[A-Fa-f0-9]{32}$/.test(value);

    icon.style.display = 'block';
    if (isValid) {
        icon.className = 'fa-solid fa-circle-check';
        icon.style.color = '#22c55e'; // green
        icon.title = 'Formato válido';
    } else {
        icon.className = 'fa-solid fa-circle-xmark';
        icon.style.color = '#ef4444'; // red
        icon.title = 'Formato inválido (deve ter 32 caracteres hexadecimais)';
    }
};

const validateSteamId = (value) => {
    const icon = document.getElementById('steamIdValidation');
    if (!icon) return;

    if (!value) {
        icon.style.display = 'none';
        return;
    }

    // Steam ID64 is 17 digits starting with 7656119
    const isValid = /^7656119[0-9]{10}$/.test(value);

    icon.style.display = 'block';
    if (isValid) {
        icon.className = 'fa-solid fa-circle-check';
        icon.style.color = '#22c55e'; // green
        icon.title = 'Steam ID válido';
    } else {
        icon.className = 'fa-solid fa-circle-xmark';
        icon.style.color = '#ef4444'; // red
        icon.title = 'Steam ID inválido (deve ter 17 dígitos)';
    }
};

const setupSteamIdDetector = () => {
    const btn = document.getElementById('btnDetectSteamId');
    if (!btn) return;

    btn.onclick = async () => {
        const input = document.getElementById('steamId');
        const value = input.value.trim();

        if (!value) {
            showToast('Cole a URL do seu perfil Steam no campo acima', 'error');
            return;
        }

        // If it's already a valid Steam ID, don't process
        if (/^7656119[0-9]{10}$/.test(value)) {
            showToast('Já é um Steam ID válido!', 'info');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class=\"fa-solid fa-spinner fa-spin\"></i> Detectando...';

        try {
            const steamId = await detectSteamIdFromUrl(value);
            if (steamId) {
                input.value = steamId;
                validateSteamId(steamId);
                showToast('Steam ID detectado com sucesso!', 'success');
            } else {
                showToast('Não foi possível detectar o Steam ID. Verifique a URL.', 'error');
            }
        } catch (error) {
            console.error('Steam ID detection error:', error);
            showToast('Erro ao detectar Steam ID: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class=\"fa-solid fa-magnifying-glass\"></i> Detectar';
        }
    };
};

const detectSteamIdFromUrl = async (url) => {
    // Pattern 1: Direct Steam ID64 (17 digits)
    const directIdMatch = url.match(/\b(7656119[0-9]{10})\b/);
    if (directIdMatch) {
        return directIdMatch[1];
    }

    // Pattern 2: Steam profile URL with ID
    const profileIdMatch = url.match(/steamcommunity\.com\/profiles\/(\d+)/);
    if (profileIdMatch) {
        return profileIdMatch[1];
    }

    // Pattern 3: Steam custom URL (vanity name) - requires API call
    const vanityMatch = url.match(/steamcommunity\.com\/id\/([^\/\?]+)/);
    if (vanityMatch) {
        const vanityName = vanityMatch[1];
        // Use Steam API to resolve vanity URL
        // Note: This requires a Steam API key, which we might already have in the form
        const apiKey = document.getElementById('steamApiKey').value.trim();

        if (!apiKey) {
            throw new Error('Por favor, insira sua Steam API Key primeiro para detectar Steam IDs de URLs customizadas');
        }

        try {
            const response = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${apiKey}&vanityurl=${vanityName}`);
            const data = await response.json();

            if (data.response && data.response.success === 1) {
                return data.response.steamid;
            } else {
                throw new Error('URL customizada não encontrada');
            }
        } catch (error) {
            throw new Error('Falha ao resolver URL customizada: ' + error.message);
        }
    }

    // If nothing matched, might be just a vanity name without full URL
    if (url.length > 0 && !/\s/.test(url) && !/^\d+$/.test(url)) {
        // Try as vanity name
        const apiKey = document.getElementById('steamApiKey').value.trim();
        if (apiKey) {
            try {
                const response = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${apiKey}&vanityurl=${url}`);
                const data = await response.json();

                if (data.response && data.response.success === 1) {
                    return data.response.steamid;
                }
            } catch (error) {
                console.error('Vanity URL resolution failed:', error);
            }
        }
    }

    return null;
};
