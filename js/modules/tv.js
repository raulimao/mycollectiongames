import { appStore } from './store.js';
import { GameService } from '../services/api.js';

let tvBox = null;
let tvHistory = [];

const loadYouTubeAPI = () => {
    if (!document.getElementById('ytApiScript')) {
        const tag = document.createElement('script');
        tag.id = 'ytApiScript';
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
};
loadYouTubeAPI();

const PROXY_YT_ENDPOINT = 'http://localhost:5500/proxy/youtube';

const fetchYoutubeVideoId = async (query) => {
    try {
        const response = await fetch(PROXY_YT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        const data = await response.json();
        if (data && data.videoId) return data.videoId;
        return null;
    } catch (e) {
        return null;
    }
};

const pickRandomGameWithVideo = async () => {
    const { allGamesStats } = appStore.get();
    if (!allGamesStats || allGamesStats.length === 0) return null;

    const shuffled = [...allGamesStats].sort(() => 0.5 - Math.random());
    const formats = ['TRAILER', 'GAMEPLAY', 'ANÁLISE'];
    
    for (let i = 0; i < Math.min(15, shuffled.length); i++) {
        const game = shuffled[i];
        const format = formats[Math.floor(Math.random() * formats.length)];
        
        if (format === 'TRAILER') {
            const details = await GameService.getGameDetails(game.title);
            if (details && details.trailers && details.trailers.length > 0) {
                const trailer = details.trailers[Math.floor(Math.random() * details.trailers.length)];
                const url = trailer.data['max'] || trailer.data['480'];
                return { game, format, type: 'rawg', url };
            }
        } else {
            const cleanName = game.title.replace(/[^a-zA-Z0-9\s]/g, '');
            const platform = game.platform && game.platform !== 'Outros' ? game.platform : '';
            const suffix = format === 'GAMEPLAY' ? 'gameplay no commentary 4k' : 'review análise pt br';
            const query = `${cleanName} ${platform} ${suffix}`;
            
            const videoId = await fetchYoutubeVideoId(query);
            if (videoId) {
                const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&fs=1&modestbranding=1&enablejsapi=1`;
                return { game, format, type: 'youtube', url: embedUrl };
            }
        }
    }
    return null; 
};

const renderTVResult = (result) => {
    if (!tvBox) return;

    if (result) {
        tvBox.setTitle(`📺 ${result.game.title} - ${result.format}`);
        
        let mediaHtml = '';
        if (result.type === 'rawg') {
            mediaHtml = `
                <video id="tvVideoPlayer" controls autoplay name="media" style="width:100%; height:100%; background: black; object-fit: contain;">
                    <source src="${result.url}" type="video/mp4">
                </video>
            `;
        } else {
            mediaHtml = `
                <iframe id="tvIframePlayer" src="${result.url}" style="width:100%; height:100%; border:none; background: black;" allow="autoplay; encrypted-media" allowfullscreen></iframe>
            `;
        }

        const historyHtml = `
            <div id="tvHistoryOverlay" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); z-index:999999; padding:20px; overflow-y:auto; color:white; flex-direction:column; gap:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:10px; margin-bottom:10px;">
                    <h3 style="margin:0; font-family:var(--font-num); font-size: 1.1rem;"><i class="fa-solid fa-clock-rotate-left"></i> HISTÓRICO DA SESSÃO</h3>
                    <button onclick="document.getElementById('tvHistoryOverlay').style.display='none'" style="background:none; border:none; color:white; cursor:pointer;"><i class="fa-solid fa-xmark fa-2x"></i></button>
                </div>
                <div id="tvHistoryList" style="display:flex; flex-direction:column; gap:8px;"></div>
            </div>
        `;

        const price = Number(result.game.price_paid || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        const hltbHours = result.game.comp_main ? Math.round(result.game.comp_main / 3600) : '?';
        const statusIcon = result.game.status === 'Finalizado' ? 'fa-check-double' : (result.game.status === 'Jogando' ? 'fa-gamepad' : 'fa-layer-group');
        const statusColor = result.game.status === 'Finalizado' ? '#10b981' : (result.game.status === 'Jogando' ? '#3b82f6' : '#aaa');

        const smartOverlayHtml = `
            <div id="tvSmartOverlay" style="position:absolute; bottom:-120px; left:0; width:100%; background:linear-gradient(0deg, rgba(15,15,20,0.98) 0%, rgba(15,15,20,0.85) 60%, transparent 100%); padding:40px 20px 20px 20px; color:white; font-family:var(--font-primary, sans-serif); transition: bottom 0.8s cubic-bezier(0.16, 1, 0.3, 1); z-index:9998; pointer-events:none; display:flex; flex-direction:column; gap:5px;">
                <div style="font-size:0.65rem; color:#f43f5e; font-weight:900; letter-spacing:1.5px; text-transform:uppercase;"><i class="fa-solid fa-chart-simple"></i> Inteligência do Cofre</div>
                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                    <div style="font-size:1.1rem; font-weight:800; max-width: 40%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow: 0 2px 10px rgba(0,0,0,0.8);">${result.game.title}</div>
                    <div style="display:flex; gap:12px; font-size:0.8rem; font-weight:700; background:rgba(255,255,255,0.1); padding:8px 15px; border-radius:12px; backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                        <span title="Status"><i class="fa-solid ${statusIcon}" style="color:${statusColor}; margin-right:6px;"></i>${result.game.status}</span>
                        <span style="color:rgba(255,255,255,0.2)">|</span>
                        <span title="Preço Pago"><i class="fa-solid fa-coins" style="color:#fbbf24; margin-right:6px;"></i>${price}</span>
                        <span style="color:rgba(255,255,255,0.2)">|</span>
                        <span title="Tempo de Jogo"><i class="fa-solid fa-clock" style="color:#a855f7; margin-right:6px;"></i>${hltbHours}h</span>
                    </div>
                </div>
            </div>
        `;

        tvBox.body.innerHTML = `
            <div style="position:relative; width:100%; height:100%; overflow:hidden;">
                ${mediaHtml}
                ${smartOverlayHtml}
                ${historyHtml}
                <div id="tvControlsArea" style="position:absolute; top:20px; right:20px; display:flex; gap:10px; z-index:9999; transition: opacity 0.3s;">
                    <button onclick="if(window.gameTV) window.gameTV.showHistory()" title="Ver Histórico" style="background:rgba(255, 255, 255, 0.15); backdrop-filter:blur(5px); color:white; border:1px solid rgba(255,255,255,0.2); padding:10px 15px; border-radius:30px; font-weight:800; font-size: 0.85rem; cursor:pointer; box-shadow:0 5px 20px rgba(0,0,0,0.5); display:flex; align-items:center; gap:8px; text-transform:uppercase; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.3)';" onmouseout="this.style.background='rgba(255,255,255,0.15)';">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                    </button>
                    <button onclick="if(window.gameTV) window.gameTV.next()" style="background:rgba(225, 29, 72, 0.95); color:white; border:none; padding:10px 20px; border-radius:30px; font-weight:800; font-size: 0.85rem; cursor:pointer; box-shadow:0 5px 20px rgba(0,0,0,0.8); display:flex; align-items:center; gap:8px; text-transform:uppercase; transition: transform 0.2s, background 0.2s;" onmouseover="this.style.transform='scale(1.05)'; this.style.background='#be123c';" onmouseout="this.style.transform='scale(1)'; this.style.background='rgba(225, 29, 72, 0.95)';">
                        Pular <i class="fa-solid fa-forward-step"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Timer do Smart Overlay
        setTimeout(() => {
            const overlay = tvBox?.body?.querySelector('#tvSmartOverlay');
            const controls = tvBox?.body?.querySelector('#tvControlsArea');
            if (overlay) {
                overlay.style.bottom = '0px';
                if (controls) controls.style.opacity = '0'; // Esconde os botões de cima para foco
                
                setTimeout(() => {
                    if (overlay) overlay.style.bottom = '-120px';
                    if (controls) controls.style.opacity = '1'; // Volta os botões
                }, 30000);
            }
        }, 4000);

        if (result.type === 'rawg') {
            const videoEl = tvBox.body.querySelector('#tvVideoPlayer');
            if (videoEl) {
                videoEl.onended = () => { if (tvBox) playNext(); };
                videoEl.onerror = () => { if (tvBox) playNext(); };
            }
        } else {
            const initYT = () => {
                if (window.YT && window.YT.Player) {
                    new window.YT.Player('tvIframePlayer', {
                        events: {
                            'onStateChange': (event) => {
                                if (event.data === window.YT.PlayerState.ENDED) {
                                    if (tvBox) playNext();
                                }
                            },
                            'onError': () => {
                                if (tvBox) playNext();
                            }
                        }
                    });
                } else {
                    setTimeout(initYT, 500);
                }
            };
            setTimeout(initYT, 100);
        }
    } else {
        tvBox.setTitle("Sem Sinal");
        tvBox.body.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%; color: #666; font-family: var(--font-num); background: #000;">Sinal Perdido (Sem vídeos encontrados)</div>';
        
        setTimeout(() => {
            if(tvBox) playNext();
        }, 3000);
    }
};

const playNext = async () => {
    if (!tvBox) return;
    tvBox.setTitle("Sintonizando...");
    tvBox.body.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%; color: white; background: #000;"><i class="fa-solid fa-circle-notch fa-spin fa-2x"></i></div>';

    const result = await pickRandomGameWithVideo();
    if (!tvBox) return;

    if (result) {
        tvHistory.push(result);
    }
    renderTVResult(result);
};

window.gameTV = {
    toggle: () => {
        if (tvBox) {
            tvBox.close();
        } else {
            tvBox = new WinBox({
                title: "Game TV",
                background: "#e11d48", 
                border: 4,
                width: "640px",
                height: "360px",
                x: "right",
                y: "bottom",
                onclose: function () {
                    tvBox = null;
                }
            });

            tvBox.addControl({
                index: 0,
                class: "wb-next",
                image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z'/></svg>",
                click: function(event, winbox){
                    playNext();
                }
            });

            playNext();
        }
    },
    next: () => {
        if (tvBox) playNext();
    },
    showHistory: () => {
        const overlay = document.getElementById('tvHistoryOverlay');
        const listContainer = document.getElementById('tvHistoryList');
        if (!overlay || !listContainer) return;
        
        if (tvHistory.length === 0) {
            listContainer.innerHTML = '<div style="text-align:center; color:#aaa; margin-top:20px;">Nenhum vídeo no histórico ainda.</div>';
        } else {
            // Map em ordem reversa para o mais recente ficar no topo
            const reversedHtml = [...tvHistory].reverse().map((item, index) => {
                // O índice real no array original
                const realIndex = tvHistory.length - 1 - index;
                return `
                <div onclick="if(window.gameTV) window.gameTV.playHistory(${realIndex})" style="background:rgba(255,255,255,0.1); padding:10px 15px; border-radius:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition:background 0.2s;" onmouseover="this.style.background='rgba(225, 29, 72, 0.4)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                    <div>
                        <div style="font-weight:bold; font-size:0.9rem;">${item.game.title}</div>
                        <div style="font-size:0.75rem; color:#aaa; text-transform:uppercase;"><i class="fa-brands ${item.type === 'youtube' ? 'fa-youtube' : 'fa-playstation'}"></i> ${item.format}</div>
                    </div>
                    <i class="fa-solid fa-play" style="color:#f43f5e;"></i>
                </div>
                `;
            }).join('');
            listContainer.innerHTML = reversedHtml;
        }
        
        overlay.style.display = 'flex';
    },
    playHistory: (index) => {
        if(index >= 0 && index < tvHistory.length) {
            // Remove o item da sua posição atual
            const [item] = tvHistory.splice(index, 1);
            // Adiciona novamente ao final (que será o topo da lista exibida)
            tvHistory.push(item);
            renderTVResult(item);
        }
    }
};