// js/api.js
const SUPABASE_URL = 'https://knacmotvgkssgnjrpamh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuYWNtb3R2Z2tzc2duanJwYW1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NzMxODUsImV4cCI6MjA5MzA0OTE4NX0.AJO277T-JoGWkhG4OIHOzpC0sbZagiHTtUQQuulPfaU';

let sb_api = null;
let current_api_user = null;

try {
    if (window.supabase) {
        sb_api = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch (err) {
    console.error('Supabase initialization error in API:', err);
}

// --- GLOBAL TOAST SYSTEM ---
window.showToast = function (message, type = 'success', duration = null) {
    // Dismiss keyboard on mobile to prevent overlap with toasts
    const nativeInput = document.getElementById('native-keyboard-input');
    if (nativeInput) nativeInput.blur();
    if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
    }

    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'streak') icon = '🔥';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span style="margin-right: 8px;">${icon}</span> ${message}`;

    container.appendChild(toast);

    // Trigger reflow
    void toast.offsetWidth;
    toast.classList.add('show');

    const defaultDuration = type === 'warning' ? 10000 : 3500;
    const finalDuration = duration !== null ? duration : defaultDuration;

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, finalDuration);
};

window.HaygAPI = {
    getClient: () => sb_api,

    async getCurrentUser() {
        if (!sb_api) return null;
        if (current_api_user) return current_api_user;
        try {
            const { data: { session } } = await sb_api.auth.getSession();
            current_api_user = session?.user || null;
            return current_api_user;
        } catch (err) {
            console.error(err);
            return null;
        }
    },

    async updateScore(gameName, score) {
        // Show XP alert for the game for ALL players (including guests)
        if (window.showToast && score > 0) {
            window.showToast(`+${score} XP Վաստակած էք!`, 'success');
        }

        if (!sb_api) return;
        const user = await this.getCurrentUser();
        if (!user) return; // Must be logged in to save score to database

        try {
            // Get current profile
            const { data: profile, error: fetchError } = await sb_api
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            let existingProfile = profile || {};

            // Streak Logic
            const today = new Date().toISOString().split('T')[0];
            let newStreak = existingProfile.streak_count || 0;

            if (existingProfile.last_active_date) {
                const lastActive = new Date(existingProfile.last_active_date);
                const currentDate = new Date(today);
                const diffTime = Math.abs(currentDate - lastActive);
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 1) {
                    newStreak += 1;
                } else if (diffDays > 1) {
                    newStreak = 1; // reset streak if missed a day
                }
            } else {
                newStreak = 1;
            }

            // Score Logic
            const scoreColumn = `${gameName}_score`;
            const currentTotalGameScore = existingProfile[scoreColumn] || 0;
            let newTotalScore = (existingProfile.total_score || 0) + score; // Accumulate XP

            let updates = {
                ...existingProfile,
                id: user.id, // Ensure ID is present for upsert
                full_name: existingProfile.full_name || user.user_metadata?.full_name || 'Անանուն',
                last_active_date: today,
                streak_count: newStreak,
                total_score: newTotalScore,
                [scoreColumn]: currentTotalGameScore + score
            };

            // Update database using upsert so missing profiles are created
            const { error: updateError } = await sb_api
                .from('profiles')
                .upsert(updates);

            if (updateError) {
                console.error('Error updating profile:', updateError);
            } else {
                if (window.updateDashboardUI) {
                    window.updateDashboardUI(newTotalScore, newStreak);
                }

                // Show fire animation if this is the first play of the day
                if (existingProfile.last_active_date !== today && newStreak > 0) {
                    setTimeout(() => {
                        window.showToast(`🔥 ${newStreak} Օրուայ Շարք!`, 'streak');
                    }, 800);
                }

                // Check for Rank Promotion
                if (window.getRankDetails) {
                    const oldRankDetails = window.getRankDetails(existingProfile.total_score || 0);
                    const newRankDetails = window.getRankDetails(newTotalScore);

                    // Trigger if the name changed (promotion)
                    if (newRankDetails.current.name !== oldRankDetails.current.name) {
                        setTimeout(() => {
                            if (window.showRankUpAnimation) {
                                window.showRankUpAnimation(
                                    newRankDetails.current.name,
                                    newRankDetails.current.emoji,
                                    newRankDetails.current.color
                                );
                            }
                        }, 1200);
                    }
                }
            }

        } catch (err) {
            console.error('API Error:', err);
        }
    },

    async getLeaderboard(gameName = 'total', limit = 10) {
        if (!sb_api) return [];
        try {
            let scoreColumn;
            if (gameName === 'total') scoreColumn = 'total_score';
            else if (gameName === 'streak') scoreColumn = 'streak_count';
            else scoreColumn = `${gameName}_score`;

            let columns = 'id, full_name, total_score, streak_count, last_active_date';
            if (gameName !== 'total' && gameName !== 'streak') {
                columns += `, ${scoreColumn}`;
            }

            // If fetching streaks, fetch more so client can sort out stale streaks
            const fetchLimit = gameName === 'streak' ? 1000 : limit;

            const { data, error } = await sb_api
                .from('profiles')
                .select(columns)
                .order(scoreColumn, { ascending: false })
                .limit(fetchLimit);

            if (error) {
                console.error('Error fetching leaderboard:', error);
                return [];
            }

            // Map the data to a standard format
            return data.map(item => ({
                id: item.id,
                full_name: item.full_name,
                total_score: item.total_score,
                streak_count: item.streak_count,
                last_active_date: item.last_active_date,
                game_score: gameName !== 'total' ? item[scoreColumn] : item.total_score
            }));
        } catch (err) {
            console.error('Leaderboard API Error:', err);
            return [];
        }
    },

    async requireAuth() {
        if (!sb_api) return;
        const user = await this.getCurrentUser();
        if (!user) {
            if (window.showToast) {
                window.showToast("Ուշադրութիւն. Կը խաղաք որպէս հիւր։ Ձեր նիշերը պիտի չպահուին մինչեւ որ հաշիւ ստեղծէք։", "warning");
            }
        }
    },

    async getWordleHints() {
        const DEFAULT_START_HINTS = 3;
        let currentHints = DEFAULT_START_HINTS;
        let user = null;

        if (sb_api) {
            user = await this.getCurrentUser();
            if (user) {
                try {
                    const { data: profile } = await sb_api
                        .from('profiles')
                        .select('wordle_hints')
                        .eq('id', user.id)
                        .single();
                    if (profile && profile.wordle_hints !== undefined && profile.wordle_hints !== null) {
                        currentHints = profile.wordle_hints;
                    }
                } catch (e) {
                    console.error('Error fetching profile hints:', e);
                }
            }
        }

        if (!user) {
            const savedHints = localStorage.getItem('wordle_hints');
            currentHints = savedHints !== null ? parseInt(savedHints, 10) : DEFAULT_START_HINTS;
            localStorage.setItem('wordle_hints', currentHints);
        }

        return Math.max(0, currentHints);
    },

    async consumeWordleHint() {
        let currentHints = await this.getWordleHints();
        if (currentHints <= 0) return 0;

        currentHints -= 1;

        localStorage.setItem('wordle_hints', currentHints);

        if (sb_api) {
            const user = await this.getCurrentUser();
            if (user) {
                try {
                    const { data: profile } = await sb_api
                        .from('profiles')
                        .select('*')
                        .eq('id', user.id)
                        .single();
                    if (profile) {
                        await sb_api.from('profiles').upsert({
                            ...profile,
                            id: user.id,
                            wordle_hints: currentHints
                        });
                    }
                } catch (e) {
                    console.error('Error updating consumed hint:', e);
                }
            }
        }

        return Math.max(0, currentHints);
    }
};

window.getRankDetails = function (xp) {
    const ranks = [
        { name: 'Պղինձ Գ', xp: 0, color: '#cd7f32', emoji: '🟤' },
        { name: 'Պղինձ Բ', xp: 500, color: '#cd7f32', emoji: '🟤' },
        { name: 'Պղինձ Ա', xp: 1000, color: '#cd7f32', emoji: '🟤' },
        { name: 'Արծաթ Գ', xp: 2000, color: '#c0c0c0', emoji: '⚪' },
        { name: 'Արծաթ Բ', xp: 3500, color: '#c0c0c0', emoji: '⚪' },
        { name: 'Արծաթ Ա', xp: 5000, color: '#c0c0c0', emoji: '⚪' },
        { name: 'Ոսկի Գ', xp: 7500, color: '#ffd700', emoji: '🟡' },
        { name: 'Ոսկի Բ', xp: 10500, color: '#ffd700', emoji: '🟡' },
        { name: 'Ոսկի Ա', xp: 14000, color: '#ffd700', emoji: '🟡' },
        { name: 'Ադամանդ Գ', xp: 18500, color: '#00f2ff', emoji: '💎' },
        { name: 'Ադամանդ Բ', xp: 24000, color: '#00f2ff', emoji: '💎' },
        { name: 'Ադամանդ Ա', xp: 30000, color: '#00f2ff', emoji: '💎' },
        { name: 'Իշխան', xp: 40000, color: '#ff00ff', emoji: '👑' }
    ];

    let currentRank = ranks[0];
    let nextRank = ranks[1];
    let rankIndex = 0;

    for (let i = 0; i < ranks.length; i++) {
        if (xp >= ranks[i].xp) {
            currentRank = ranks[i];
            rankIndex = i;
        } else {
            break;
        }
    }

    if (rankIndex < ranks.length - 1) {
        nextRank = ranks[rankIndex + 1];
    } else {
        nextRank = currentRank; // Max rank achieved
    }

    const progressPercent = nextRank.xp > currentRank.xp ? ((xp - currentRank.xp) / (nextRank.xp - currentRank.xp)) * 100 : 100;

    return { current: currentRank, next: nextRank, progress: Math.max(0, Math.min(100, progressPercent)) };
};

window.showRankUpAnimation = function (rankName, emoji, color) {
    // Dismiss keyboard on mobile to show full screen
    const nativeInput = document.getElementById('native-keyboard-input');
    if (nativeInput) nativeInput.blur();
    if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
    }

    let overlay = document.getElementById('rank-up-overlay');

    // Play sound
    try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3');
        audio.volume = 0.5;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => console.log('Audio playback failed:', error));
        }
    } catch (e) {
        console.log('Audio playback exception:', e);
    }

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'rank-up-overlay';
        overlay.className = 'rank-up-overlay';
        overlay.innerHTML = `
            <canvas id="confetti-canvas" class="confetti-canvas"></canvas>
            <div class="rank-up-content">
                <div class="rank-up-label">ՆՈՐ ՄԱԿԱՐԴԱԿ</div>
                <div class="rank-up-emoji">${emoji}</div>
                <div class="rank-up-name">${rankName}</div>
                <div class="rank-up-msg">Շնորհաւոր! Դուք բարձրացաք նոր մակարդակ:</div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', () => {
            overlay.classList.remove('show');
        });
    } else {
        overlay.querySelector('.rank-up-emoji').textContent = emoji;
        overlay.querySelector('.rank-up-name').textContent = rankName;
    }

    // Trigger reflow to ensure CSS transitions happen properly
    void overlay.offsetWidth;

    overlay.querySelector('.rank-up-emoji').style.color = color;
    overlay.classList.add('show');

    // Auto hide after 5 seconds
    setTimeout(() => {
        overlay.classList.remove('show');
    }, 6000);

    // Simple confetti
    if (window.startConfetti) {
        window.startConfetti();
    }
};

window.startConfetti = function () {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let particles = [];
    const colors = ['#8b5cf6', '#3b82f6', '#f97316', '#10b981', '#ef4444'];

    for (let i = 0; i < 100; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 8 + 4,
            speed: Math.random() * 5 + 2,
            color: colors[Math.floor(Math.random() * colors.length)],
            angle: Math.random() * 6.28,
            spin: Math.random() * 0.2 - 0.1
        });
    }

    function update() {
        const overlayObj = document.getElementById('rank-up-overlay');
        if (!overlayObj || !overlayObj.classList.contains('show')) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.y += p.speed;
            p.angle += p.spin;
            ctx.fillStyle = p.color;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
            if (p.y > canvas.height) p.y = -20;
        });
        requestAnimationFrame(update);
    }
    update();
};

// --- SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered', reg))
            .catch(err => console.error('Service Worker registration failed', err));
    });
}
