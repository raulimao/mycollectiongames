/**
 * Subscription Service - GameVault PRO
 * Gerencia assinaturas, checkout Stripe e feature gating
 */

import { supabase } from './supabase.js';

// Stripe Configuration
const STRIPE_CONFIG = {
    publishableKey: 'pk_test_51SiemIEvceEgRKY88JOcXCsESeO0DqgGNHvkUAVIeTeQFRSGvbUrHSDptfxCuTdfyALHVZFV0CIomtspLx2w52wp00YHGKsXkv',
    priceMonthly: 'price_1SieqgEvceEgRKY8mt05yufl',
    priceAnnual: 'price_1SieqgEvceEgRKY8ZcxZXl0b'
};

// Configuração de planos
const PLANS = {
    free: {
        name: 'Free',
        price: 0,
        limits: {
            maxGames: 50,
            hasFinancialDashboard: false,
            hasGogImport: false,
            hasPriceAlerts: false,
            hasAutoBackup: false
        }
    },
    pro_monthly: {
        name: 'PRO Mensal',
        price: 9.90,
        priceId: STRIPE_CONFIG.priceMonthly,
        limits: {
            maxGames: Infinity,
            hasFinancialDashboard: true,
            hasGogImport: true,
            hasPriceAlerts: true,
            hasAutoBackup: true
        }
    },
    pro_annual: {
        name: 'PRO Anual',
        price: 99.00,
        priceId: STRIPE_CONFIG.priceAnnual,
        limits: {
            maxGames: Infinity,
            hasFinancialDashboard: true,
            hasGogImport: true,
            hasPriceAlerts: true,
            hasAutoBackup: true
        }
    }
};

// Cache local da subscription
let cachedSubscription = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minuto

export const SubscriptionService = {

    /**
     * Busca status atual da subscription do usuário
     */
    async getStatus(userId) {
        // Retorna cache se válido
        if (cachedSubscription && Date.now() - cacheTimestamp < CACHE_TTL) {
            return cachedSubscription;
        }

        try {
            // Usando maybeSingle() ao invés de single() para evitar erro quando não há registro
            const { data, error } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();

            if (error) {
                console.error('[Subscription] Erro ao buscar:', error);
                return this.getDefaultSubscription();
            }

            if (!data) {
                console.log('[Subscription] Nenhuma subscription encontrada, retornando default');
                return this.getDefaultSubscription();
            }

            cachedSubscription = data;
            cacheTimestamp = Date.now();
            console.log('[Subscription] Carregada:', data.plan, data.status);

            return cachedSubscription;
        } catch (err) {
            console.error('[Subscription] Erro inesperado:', err);
            return this.getDefaultSubscription();
        }
    },

    /**
     * Retorna subscription padrão (free)
     */
    getDefaultSubscription() {
        return {
            plan: 'free',
            status: 'active',
            trial_ends_at: null,
            current_period_end: null,
            cancel_at_period_end: false
        };
    },

    /**
     * Verifica se usuário é PRO (pago ou trial válido)
     */
    isPro(subscription) {
        if (!subscription) return false;

        // Trial ativo
        if (subscription.status === 'trialing') {
            const trialEnd = new Date(subscription.trial_ends_at);
            if (trialEnd > new Date()) return true;
        }

        // Plano pago ativo
        if (subscription.status === 'active') {
            if (subscription.plan === 'pro_monthly' || subscription.plan === 'pro_annual') {
                return true;
            }
        }

        return false;
    },

    /**
     * Verifica se feature específica está disponível
     */
    async canAccess(userId, feature) {
        const sub = await this.getStatus(userId);
        const plan = PLANS[sub.plan] || PLANS.free;

        if (this.isPro(sub)) {
            return true; // PRO tem acesso a tudo
        }

        return plan.limits[feature] || false;
    },

    /**
     * Retorna limites do plano atual
     */
    async getLimits(userId) {
        const sub = await this.getStatus(userId);

        if (this.isPro(sub)) {
            return PLANS.pro_monthly.limits;
        }

        return PLANS.free.limits;
    },

    /**
     * Verifica se atingiu limite de jogos
     */
    async checkGameLimit(userId, currentCount) {
        const limits = await this.getLimits(userId);
        return currentCount < limits.maxGames;
    },

    /**
     * Inicia trial de 7 dias
     */
    async startTrial(userId) {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 7);

        const { data, error } = await supabase
            .from('subscriptions')
            .upsert({
                user_id: userId,
                plan: 'trial',
                status: 'trialing',
                trial_ends_at: trialEnd.toISOString(),
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' })
            .select()
            .single();

        if (error) {
            console.error('Erro ao iniciar trial:', error);
            throw error;
        }

        // Invalida cache
        cachedSubscription = null;

        return data;
    },

    /**
     * Retorna o Price ID baseado no tipo de plano
     * @param {string} planType - 'monthly' ou 'annual'
     */
    getPriceId(planType) {
        if (planType === 'monthly') {
            return STRIPE_CONFIG.priceMonthly;
        } else if (planType === 'annual') {
            return STRIPE_CONFIG.priceAnnual;
        }
        return null;
    },

    /**
     * Redireciona para Stripe Checkout (via Payment Link)
     * Nota: Para produção, implemente uma Edge Function para criar session
     * @param {string} planType - 'monthly' ou 'annual'
     * @param {string} userEmail - Email do usuário para pré-preencher
     */
    async checkout(planType, userEmail = null) {
        const priceId = this.getPriceId(planType);

        if (!priceId) {
            console.error('Price ID não encontrado para:', planType);
            return;
        }

        // Para MVP: Usar Stripe Checkout via URL direta
        // Em produção, crie uma Edge Function no Supabase
        const successUrl = encodeURIComponent(window.location.origin + window.location.pathname + '?payment=success');
        const cancelUrl = encodeURIComponent(window.location.origin + window.location.pathname + '?payment=canceled');

        // Log para debug
        console.log('[Stripe] Iniciando checkout:', { planType, priceId, userEmail });

        // Para MVP sem backend: mostrar instruções
        // Quando tiver Edge Function, descomentar o código abaixo

        const message = `
🎯 Para completar a integração Stripe:

1. Crie um Payment Link no Stripe Dashboard:
   - Vá em Products → GameVault PRO → Create payment link
   - Configure Success URL: ${decodeURIComponent(successUrl)}
   
2. Ou implemente uma Edge Function no Supabase para criar Checkout Sessions

Por enquanto, vamos simular ativando o Trial de 7 dias!
        `.trim();

        console.log(message);

        // Para demonstração, perguntar se quer ativar trial
        const wantTrial = confirm('O checkout Stripe precisa de configuração adicional.\n\nDeseja ativar o Trial de 7 dias para testar as features PRO?');

        if (wantTrial) {
            // Buscar user ID atual
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await this.startTrial(user.id);
                window.location.reload();
            }
        }
    },

    /**
     * Abre portal do cliente Stripe para gerenciar assinatura
     */
    async openPortal() {
        // Para MVP: mostrar opções básicas
        console.log('[Stripe] Portal do cliente - requer Edge Function');

        alert('Para gerenciar sua assinatura:\n\n• Cancelar: Entre em contato pelo email\n• Atualizar pagamento: Acesse stripe.com\n\nEm breve teremos portal self-service!');
    },

    /**
     * Limpa cache (usar após webhook atualizar)
     */
    clearCache() {
        cachedSubscription = null;
        cacheTimestamp = 0;
    },

    /**
     * Retorna info dos planos para UI
     */
    getPlansInfo() {
        return {
            monthly: {
                name: 'PRO Mensal',
                price: 'R$ 9,90/mês',
                priceRaw: 9.90
            },
            annual: {
                name: 'PRO Anual',
                price: 'R$ 99/ano',
                priceRaw: 99.00,
                savings: 'Economia de R$ 19,80 (2 meses grátis!)'
            },
            trial: {
                name: 'Trial Gratuito',
                duration: '7 dias',
                description: 'Teste todas as features PRO'
            }
        };
    }
};

// Exporta também os planos para uso externo
export { PLANS };
