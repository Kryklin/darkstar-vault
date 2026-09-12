export interface GameState {
  currentRoom: string;
  inventory: string[];
  flags: Record<string, boolean>;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  exits: Record<string, string>;
  items: string[];
}

export class ZorkEngine {
  private rooms: Record<string, Room> = {
    west_of_house: {
      id: 'west_of_house',
      name: 'West of House',
      description: 'You are standing in an open field west of a white house, with a boarded front door. There is a small mailbox here.',
      exits: { north: 'north_of_house', south: 'south_of_house', east: 'front_door' },
      items: ['mailbox'],
    },
    north_of_house: {
      id: 'north_of_house',
      name: 'North of House',
      description: 'You are facing the north side of a white house. There is no door here, and all the windows are boarded up.',
      exits: { south: 'west_of_house', east: 'behind_house' },
      items: [],
    },
    south_of_house: {
      id: 'south_of_house',
      name: 'South of House',
      description: 'You are facing the south side of a white house. There is a small window here which is slightly ajar.',
      exits: { north: 'west_of_house', east: 'behind_house', in: 'kitchen' },
      items: [],
    },
    behind_house: {
      id: 'behind_house',
      name: 'Behind House',
      description: 'You are behind the white house. A path leads north into the forest. There is a window here that is boarded up.',
      exits: { west: 'north_of_house', north: 'forest' },
      items: [],
    },
    kitchen: {
      id: 'kitchen',
      name: 'Kitchen',
      description: 'A dark kitchen filled with the smell of old spices. On the table sits a d-kasp-512 encrypted leaflet.',
      exits: { out: 'south_of_house', west: 'living_room' },
      items: ['leaflet'],
    },
    living_room: {
      id: 'living_room',
      name: 'Living Room',
      description: 'A dusty living room with a trophy case. A large trap door in the floor is closed.',
      exits: { east: 'kitchen', down: 'cellar' },
      items: ['trophy_case'],
    },
    cellar: {
      id: 'cellar',
      name: 'Cellar',
      description: 'A dark, damp cellar. You can hear a faint humming sound. A passage leads south.',
      exits: { up: 'living_room', south: 'dark_room' },
      items: [],
    },
    dark_room: {
      id: 'dark_room',
      name: 'The Dark Room',
      description: 'It is pitch black. You are likely to be eaten by a grue. If only you had a light source or a master key.',
      exits: { north: 'cellar' },
      items: [],
    },
    forest: {
      id: 'forest',
      name: 'Forest',
      description: 'This is a dimly lit forest, with large trees all around. To the south is the house.',
      exits: { south: 'behind_house' },
      items: ['brass_lantern'],
    },
  };

  private state: GameState = {
    currentRoom: 'west_of_house',
    inventory: [],
    flags: {
      mailbox_open: false,
      trap_door_open: false,
      lantern_on: false,
    },
  };

  public processInput(input: string): string[] {
    const parts = input.toLowerCase().trim().split(/\s+/);
    const verb = parts[0];
    const noun = parts[1];

    switch (verb) {
      case 'l':
      case 'look':
        return this.look();
      case 'i':
      case 'inventory':
        return this.getInventory();
      case 'n':
      case 'north':
        return this.move('north');
      case 's':
      case 'south':
        return this.move('south');
      case 'e':
      case 'east':
        return this.move('east');
      case 'w':
      case 'west':
        return this.move('west');
      case 'u':
      case 'up':
        return this.move('up');
      case 'd':
      case 'down':
        return this.move('down');
      case 'in':
        return this.move('in');
      case 'out':
        return this.move('out');
      case 'open':
        return this.open(noun);
      case 'take':
      case 'get':
        return this.take(noun);
      case 'read':
        return this.read(noun);
      case 'turn':
        if (noun === 'on' || parts[2] === 'on') return this.turnOn(parts[2] || parts[1]);
        return ["I don't know how to turn that."];
      default:
        return ["I don't understand that command."];
    }
  }

  private look(): string[] {
    const room = this.rooms[this.state.currentRoom];
    const output = [room.name, room.description];
    if (room.items.length > 0) {
      const visibleItems = room.items.filter((i) => {
        if (i === 'mailbox' && this.state.flags['mailbox_open']) return false;
        return true;
      });
      if (visibleItems.length > 0) {
        output.push(`Items present: ${visibleItems.join(', ')}`);
      }
    }
    if (this.state.currentRoom === 'west_of_house' && this.state.flags['mailbox_open']) {
      output.push('The mailbox is open, containing a leaflet.');
    }
    return output;
  }

  private getInventory(): string[] {
    if (this.state.inventory.length === 0) return ['You are empty-handed.'];
    return ['You are carrying:', ...this.state.inventory.map((item) => `  - ${item}`)];
  }

  private move(direction: string): string[] {
    const room = this.rooms[this.state.currentRoom];
    const nextRoomId = room.exits[direction];

    if (!nextRoomId) return ["You can't go that way."];

    if (nextRoomId === 'cellar' && !this.state.flags['trap_door_open']) {
      return ['The trap door is closed.'];
    }

    if (nextRoomId === 'dark_room' && !this.state.flags['lantern_on']) {
      return ['It is too dark to proceed. You are likely to be eaten by a grue.'];
    }

    this.state.currentRoom = nextRoomId;
    return this.look();
  }

  private open(noun: string): string[] {
    if (!noun) return ['What do you want to open?'];

    if (noun === 'mailbox' && this.state.currentRoom === 'west_of_house') {
      this.state.flags['mailbox_open'] = true;
      return ['Opened.'];
    }

    if (noun === 'trap' || noun === 'door' || noun === 'trapdoor') {
      if (this.state.currentRoom === 'living_room') {
        this.state.flags['trap_door_open'] = true;
        return ['The trap door is now open.'];
      }
    }

    return ["You can't open that."];
  }

  private take(noun: string): string[] {
    if (!noun) return ['What do you want to take?'];

    const room = this.rooms[this.state.currentRoom];

    if (noun === 'leaflet' && this.state.currentRoom === 'west_of_house' && this.state.flags['mailbox_open']) {
      this.state.inventory.push('leaflet');
      return ['Taken.'];
    }

    if (noun === 'leaflet' && this.state.currentRoom === 'kitchen') {
      this.state.inventory.push('leaflet');
      room.items = room.items.filter((i) => i !== 'leaflet');
      return ['Taken.'];
    }

    if (noun === 'lantern' || noun === 'brass_lantern') {
      if (room.items.includes('brass_lantern')) {
        this.state.inventory.push('brass_lantern');
        room.items = room.items.filter((i) => i !== 'brass_lantern');
        return ['Taken.'];
      }
    }

    return ["You can't see that here."];
  }

  private read(noun: string): string[] {
    if (noun === 'leaflet' && this.state.inventory.includes('leaflet')) {
      return [
        'WELCOME TO DARKSTAR!',
        'ZORK is a game of adventure, danger, and low-level encryption.',
        'In this version, you must find the Master Key to survive the shadows.',
        'Hint: The forest hides the light, the kitchen hides the message.',
      ];
    }
    return ['You have nothing to read.'];
  }

  private turnOn(noun: string): string[] {
    if ((noun === 'lantern' || noun === 'brass_lantern') && this.state.inventory.includes('brass_lantern')) {
      this.state.flags['lantern_on'] = true;
      return ['The brass lantern is now glowing with a soft light.'];
    }
    return ["You can't turn that on."];
  }
}
