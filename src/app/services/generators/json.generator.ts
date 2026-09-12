import { StegoGenerator } from './types';

export class JsonGenerator implements StegoGenerator {
  /**
   * Generates a disguised JSON file containing the payload.
   * Selects a random template from a set of realistic application configurations
   * to maximize plausible deniability.
   *
   * @param payload The encrypted data to hide.
   */
  generate(payload: string /* options */): string {
    const templates = [this.generateVSCode, this.generateNvidia, this.generateSpotify, this.generateChrome, this.generateWindowsUpdate];

    // Select a random template and bind context to ensure correct execution
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)].bind(this);
    return JSON.stringify(randomTemplate(payload), null, 2);
  }

  /**
   * Extracts the hidden payload from a JSON string.
   * attempts to locate the payload by checking known concealment paths
   * associated with each supported template.
   *
   * @param content The JSON content to parse.
   */
  extract(content: string): string {
    try {
      const obj = JSON.parse(content);

      // Attempt to extract payload from known storage paths

      // 1. VSCode Configuration
      if (obj?.telemetry?.machineId) return obj.telemetry.machineId;

      // 2. Nvidia Driver Cache
      if (obj?.cache?.shader_hash) return obj.cache.shader_hash;

      // 3. Spotify Offline Storage
      if (obj?.offline?.storage?.index_id) return obj.offline.storage.index_id;

      // 4. Chrome Profile Sync
      if (obj?.profile?.sync_guid) return obj.profile.sync_guid;

      // 5. Windows Update Policy
      if (obj?.policy?.update_session_id) return obj.policy.update_session_id;

      // Legacy fallback for backward compatibility
      if (obj?.system_integrity?.integrity_hash) return obj.system_integrity.integrity_hash;

      return '';
    } catch (e) {
      console.error('JSON Extraction Error: Failed to parse content', e);
      return '';
    }
  }

  // --- Configuration Templates ---

  private generateVSCode(payload: string) {
    return {
      'editor.fontSize': 14,
      'editor.fontFamily': "'JetBrains Mono', Consolas, 'Courier New', monospace",
      'workbench.colorTheme': 'Default Dark+',
      'files.autoSave': 'afterDelay',
      telemetry: {
        enableCrashReporter: true,
        enableTelemetry: false,
        machineId: payload,
      },
      'git.autofetch': true,
    };
  }

  private generateNvidia(payload: string) {
    return {
      display: {
        resolution: '3840x2160',
        refreshRate: 144,
        gSync: 'enabled',
      },
      cache: {
        location: '%PROGRAMDATA%/NVIDIA Corporation/Drs',
        size_mb: 4096,
        shader_hash: payload,
      },
      global_presest: 'quality',
    };
  }

  private generateSpotify(payload: string) {
    return {
      audio: {
        volume: 85,
        quality: 'very_high',
        normalization: true,
        crossfade: 5,
      },
      offline: {
        storage: {
          path: 'C:/Users/AppData/Local/Spotify/Storage',
          index_id: payload,
        },
        enabled: true,
      },
    };
  }

  private generateChrome(payload: string) {
    return {
      browser: {
        start_page: 'https://google.com',
        theme: 'system',
        check_default_browser: false,
      },
      profile: {
        name: 'Default',
        avatar_icon: 'cat',
        sync_guid: payload,
        managed: false,
      },
      extensions: ['uBlock', 'React DevTools'],
    };
  }

  private generateWindowsUpdate(payload: string) {
    return {
      windows_update: {
        auto_download: false,
        active_hours: '08:00-17:00',
        defer_feature_updates: 7,
      },
      delivery_optimization: {
        allow_peers: true,
        bandwidth_limit: 0,
      },
      policy: {
        channel: 'Retail',
        update_session_id: payload,
      },
    };
  }
}
