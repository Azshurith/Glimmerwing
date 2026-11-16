import { Column, Entity, PrimaryColumn } from 'typeorm';
import { Timestamped, asJson, asNumber } from './columns';

/** A player's settings (key bindings, display, sound); the newer of two copies wins. */
@Entity('players_settings')
export class SettingsRow extends Timestamped {
    @PrimaryColumn({ name: 'player_id', type: 'int', unsigned: true })
    playerId!: number;

    @Column({ type: 'longtext', transformer: asJson })
    data!: object;

    /** When the browser saved them (its clock, ms). */
    @Column({ name: 'saved_at', type: 'bigint', default: 0, transformer: asNumber })
    savedAt!: number;
}
