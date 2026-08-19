const body = document.body;
const darkModeToggle = document.getElementById('dark-mode-toggle');

function setDarkMode(enabled) {
    body.classList.toggle('dark-mode', enabled);
    if (darkModeToggle) {
        darkModeToggle.textContent = enabled ? '☀️' : '🌙';
    }
    localStorage.setItem('darkMode', enabled);
}

// Sync with localStorage preference, default to dark-mode (true) if not set
const savedDarkMode = localStorage.getItem('darkMode') !== 'false';
setDarkMode(savedDarkMode);

if (darkModeToggle) {
    darkModeToggle.addEventListener('click', () => {
        setDarkMode(!body.classList.contains('dark-mode'));
    });
}

// --- Native Keyboard Management ---
const keyboardToggle = document.getElementById('keyboard-toggle');

// Create a hidden input for games that don't have one
const hiddenMobileInput = document.createElement('input');
hiddenMobileInput.type = 'text';
hiddenMobileInput.id = 'hidden-mobile-input';
hiddenMobileInput.setAttribute('autocapitalize', 'none');
hiddenMobileInput.setAttribute('autocomplete', 'off');
hiddenMobileInput.setAttribute('spellcheck', 'false');
hiddenMobileInput.style.position = 'fixed';
hiddenMobileInput.style.top = '50%'; // Center vertically to minimize scroll urge
hiddenMobileInput.style.left = '50%';
hiddenMobileInput.style.width = '1px';
hiddenMobileInput.style.height = '1px';
hiddenMobileInput.style.opacity = '0';
hiddenMobileInput.style.fontSize = '16px'; // Prevent iOS zoom
hiddenMobileInput.style.pointerEvents = 'none';
hiddenMobileInput.style.zIndex = '-1';
document.body.appendChild(hiddenMobileInput);

function setNativeKeyboard(enabled) {
    body.classList.toggle('native-keyboard-mode', enabled);
    if (keyboardToggle) {
        keyboardToggle.textContent = enabled ? '⌨️' : '📱';
    }
    localStorage.setItem('nativeKeyboard', enabled);

    // Check if current game has an explicit input (like faces-game)
    const guessInput = document.getElementById('guess-input');
    if (guessInput) {
        if (enabled) {
            guessInput.removeAttribute('readonly');
            guessInput.removeAttribute('inputmode');
            guessInput.focus({ preventScroll: true });
        } else {
            guessInput.setAttribute('readonly', 'true');
            guessInput.setAttribute('inputmode', 'none');
            guessInput.blur();
        }
    } else {
        if (enabled) {
            hiddenMobileInput.focus({ preventScroll: true });
        } else {
            hiddenMobileInput.blur();
        }
    }
}

// Initialize native keyboard preference
const savedNativeKeyboard = localStorage.getItem('nativeKeyboard') === 'true';
setTimeout(() => {
    if (document.getElementById('keyboard-toggle')) {
        setNativeKeyboard(savedNativeKeyboard);
    }
}, 100); // Small delay to let game scripts setup

if (keyboardToggle) {
    keyboardToggle.addEventListener('click', () => {
        setNativeKeyboard(!body.classList.contains('native-keyboard-mode'));
    });
}

// Keep input focused when clicking elsewhere in native mode
document.addEventListener('click', (e) => {
    if (body.classList.contains('native-keyboard-mode')) {
        // Ignore clicks on header controls, start overlays, or focus overlays
        if (e.target.closest('.header-controls') || e.target.closest('.game-header') ||
            e.target.closest('.start-overlay') || e.target.closest('.focus-overlay')) {
            return;
        }

        const guessInput = document.getElementById('guess-input');
        if (!guessInput) {
            hiddenMobileInput.focus();
        }
    }
});

// Relay hidden input events to games (simulating physical keyboard)
hiddenMobileInput.addEventListener('input', (e) => {
    if (e.data) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: e.data }));
        document.dispatchEvent(new KeyboardEvent('keyup', { key: e.data }));
    }
    hiddenMobileInput.value = '';
});

hiddenMobileInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Backspace' || e.key === 'Enter') {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: e.key }));
        document.dispatchEvent(new KeyboardEvent('keyup', { key: e.key }));
    }
});

hiddenMobileInput.addEventListener('keyup', (e) => {
    e.stopPropagation();
});
// Prevent buttons from staying focused after click (prevents accidental Space/Enter triggers)
document.addEventListener('click', (e) => {
    if (e.target.closest('button')) {
        e.target.closest('button').blur();
    }
});
