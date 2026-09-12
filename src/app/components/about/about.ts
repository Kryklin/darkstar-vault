import { Component, signal } from '@angular/core';
import { MaterialModule } from '../../modules/material/material';

import packageJson from '../../../../package.json';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [MaterialModule],
  templateUrl: './about.html',
  styleUrl: './about.scss',
})
export class About {
  version = packageJson.version;
  repoUrl = packageJson.repository.url.replace('.git', '');
  licenseType = 'MIT License';
  donationUrl = 'https://blockstream.info/address/bc1qsstnef7gh3rl593t4lm9276zk43rjl3mux9m5f72xp4cvr5gep5skam5hx';

  hasAchievement = signal(localStorage.getItem('darkstar_asteroid_achievement') === 'true');

  openLink(url: string) {
    window.open(url, '_blank');
  }
}
